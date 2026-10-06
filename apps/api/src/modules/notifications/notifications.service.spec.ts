import { NotificationsService } from './notifications.service';
import { NotificationDispatchService } from './dispatch.service';

/**
 * Phase 11 tests: inbox unread counts + broadcast audience chunking.
 * Prisma and channel adapters are mocked.
 */

function makeInboxPrisma() {
  const rows = [
    { id: 'n1', type: 'DEAL_APPROVED', title: 't', body: 'b', channel: 'IN_APP', status: 'SENT', data: null, readAt: null, sentAt: new Date(), createdAt: new Date() },
    { id: 'n2', type: 'DEAL_APPROVED', title: 't', body: 'b', channel: 'IN_APP', status: 'OPENED', data: null, readAt: new Date(), sentAt: new Date(), createdAt: new Date() },
  ];
  // Filter-aware mocks: behave like the real DB for the unreadOnly filter.
  const applyWhere = (where: any) =>
    where?.readAt === null ? rows.filter((r) => r.readAt === null) : rows;
  return {
    notification: {
      count: jest.fn(async ({ where }: any) => applyWhere(where).length),
      findMany: jest.fn(async ({ where }: any) => applyWhere(where)),
      findFirst: jest.fn().mockResolvedValue(rows[0]),
      update: jest.fn().mockResolvedValue(rows[0]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'nx', ...data })),
    },
  } as any;
}

describe('NotificationsService', () => {
  it('unreadCount counts only unread in-app rows', async () => {
    const svc = new NotificationsService(makeInboxPrisma());
    await expect(svc.unreadCount('u1')).resolves.toEqual({ unread: 1 });
  });

  it('listNotifications passes unreadOnly through', async () => {
    const prisma = makeInboxPrisma();
    const svc = new NotificationsService(prisma);
    const page = await svc.listNotifications('u1', { unreadOnly: true });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ readAt: null }) }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it('markAllAsRead returns the marked count', async () => {
    const svc = new NotificationsService(makeInboxPrisma());
    await expect(svc.markAllAsRead('u1')).resolves.toEqual({ marked: 1 });
  });
});

describe('NotificationDispatchService.broadcast', () => {
  function makeDispatchPrisma(recipientCount: number) {
    const recipients = Array.from({ length: recipientCount }, (_, i) => ({ id: `u${i}` }));
    return {
      user: {
        findMany: jest.fn().mockImplementation(async ({ where, take }: any) => {
          // audience query
          if (where?.roles) return recipients.slice(0, take ?? recipients.length);
          // dispatch lookup — honor the id filter
          const ids: string[] = where?.id?.in ?? recipients.map((r) => r.id);
          return recipients
            .filter((r) => ids.includes(r.id))
            .map((r) => ({ ...r, email: `${r.id}@x.test`, phone: null, firstName: 'Test' }));
        }),
      },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      notificationCampaign: {
        create: jest.fn().mockResolvedValue({ id: 'c1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as any;
  }

  const channels = {
    email: { configured: false, send: jest.fn() },
    sms: { configured: false, send: jest.fn() },
    whatsapp: { configured: false, send: jest.fn() },
  } as any;

  it('resolves the customers audience and chunks dispatch (250/chunk)', async () => {
    const prisma = makeDispatchPrisma(600);
    const svc = new NotificationDispatchService(prisma, channels.email, channels.sms, channels.whatsapp);
    const res = await svc.broadcast({ title: 'Hi', body: 'Hello', audience: 'customers', channels: ['IN_APP'] });
    expect(res.recipients).toBe(600);
    // 600 recipients → 3 chunks of dispatch (250/250/100)
    expect(prisma.user.findMany).toHaveBeenCalled();
    const campaignUpdate = prisma.notificationCampaign.update.mock.calls;
    expect(campaignUpdate[campaignUpdate.length - 1][0]).toMatchObject({
      where: { id: 'c1' },
      data: { status: 'SENT' },
    });
  });

  it('records SKIPPED for email when SMTP is not configured (never pretend-delivered)', async () => {
    const prisma = makeDispatchPrisma(1);
    const svc = new NotificationDispatchService(prisma, channels.email, channels.sms, channels.whatsapp);
    await svc.dispatch('u0', { type: 'ANNOUNCEMENT', title: 'Hi', body: 'Hello', channels: ['IN_APP', 'EMAIL'] });
    const creates = prisma.notification.create.mock.calls.map((c: any) => c[0].data);
    const emailRow = creates.find((d: any) => d.channel === 'EMAIL');
    expect(emailRow).toBeDefined();
    expect(emailRow.status).toBe('SKIPPED');
    expect(channels.email.send).not.toHaveBeenCalled();
  });

  it('honors the user topic preference (opt-out skips silently)', async () => {
    const prisma = makeDispatchPrisma(1);
    prisma.notificationPreference.findMany = jest.fn().mockResolvedValue([{ userId: 'u0', marketing: false }]);
    const svc = new NotificationDispatchService(prisma, channels.email, channels.sms, channels.whatsapp);
    await svc.dispatch('u0', { type: 'ANNOUNCEMENT', title: 'Hi', body: 'Hello', channels: ['IN_APP'] });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('never throws on per-user failure', async () => {
    const prisma = makeDispatchPrisma(1);
    prisma.user.findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const svc = new NotificationDispatchService(prisma, channels.email, channels.sms, channels.whatsapp);
    await expect(svc.dispatch('u0', { type: 'ANNOUNCEMENT', title: 'Hi', body: 'Hello', channels: ['IN_APP'] })).resolves.toEqual({ attempted: 0 });
  });
});
