import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_SERVICE, IStorageService } from '../../common/storage/storage.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

/**
 * Phase 7 — self-service profile + notification preferences.
 * All writes are scoped to the authenticated user; no admin-only fields allowed.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        profile: true,
        city: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    const filled = [
      !!user.firstName,
      !!user.lastName,
      !!user.email,
      !!user.phone,
      !!user.cityId,
      !!user.areaId,
      !!user.profile?.dateOfBirth,
      !!user.profile?.avatar,
      !!user.language,
    ];
    const completeness = Math.round((filled.filter(Boolean).length / filled.length) * 100);

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      city: user.city,
      area: user.area,
      dateOfBirth: user.profile?.dateOfBirth ?? null,
      gender: user.profile?.gender ?? null,
      avatar: user.profile?.avatar ?? null,
      address: user.profile?.address ?? null,
      bio: user.profile?.bio ?? null,
      language: user.language ?? 'ur',
      emailVerified: !!user.emailVerifiedAt,
      phoneVerified: !!user.phoneVerifiedAt,
      referralCode: user.referralCode,
      memberSince: user.createdAt,
      profileCompleteness: completeness,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.phone) {
      const clash = await this.prisma.user.findFirst({
        where: { phone: dto.phone, id: { not: userId }, deletedAt: null },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException({
          code: 'PHONE_IN_USE',
          message: 'This phone number is already linked to another account.',
        });
      }
    }
    if (dto.cityId) {
      const city = await this.prisma.city.findFirst({
        where: { id: dto.cityId, isActive: true },
        select: { id: true },
      });
      if (!city) {
        throw new NotFoundException({ code: 'CITY_NOT_FOUND', message: 'City not found.' });
      }
    }
    if (dto.areaId) {
      const area = await this.prisma.area.findFirst({
        where: { id: dto.areaId, isActive: true },
        select: { id: true, cityId: true },
      });
      if (!area) {
        throw new NotFoundException({ code: 'AREA_NOT_FOUND', message: 'Area not found.' });
      }
      // Area must belong to the user's city (new or existing).
      const effectiveCityId = dto.cityId ?? (await this.prisma.user.findUnique({ where: { id: userId }, select: { cityId: true } }))?.cityId;
      if (effectiveCityId && area.cityId !== effectiveCityId) {
        throw new ConflictException({
          code: 'AREA_CITY_MISMATCH',
          message: 'The selected area does not belong to your city.',
        });
      }
    }

    const { dateOfBirth, marketingOptIn, ...userFields } = dto;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: userFields.firstName,
          lastName: userFields.lastName,
          phone: userFields.phone,
          cityId: userFields.cityId,
          areaId: userFields.areaId,
          language: userFields.language,
        },
      });
      if (dateOfBirth !== undefined) {
        await tx.userProfile.upsert({
          where: { userId },
          create: { userId, dateOfBirth },
          update: { dateOfBirth },
        });
      }
      if (marketingOptIn !== undefined) {
        await tx.notificationPreference.upsert({
          where: { userId },
          create: { userId, marketing: marketingOptIn },
          update: { marketing: marketingOptIn },
        });
      }
    });
    return this.getProfile(userId);
  }

  private prefDefaults() {
    return {
      dealAlerts: true,
      savingsSummary: true,
      membershipReminders: true,
      referralUpdates: true,
      marketing: true,
    };
  }

  async getNotificationPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreference.findUnique({ where: { userId } });
    return prefs
      ? {
          dealAlerts: prefs.dealAlerts,
          savingsSummary: prefs.savingsSummary,
          membershipReminders: prefs.membershipReminders,
          referralUpdates: prefs.referralUpdates,
          marketing: prefs.marketing,
          updatedAt: prefs.updatedAt,
        }
      : { ...this.prefDefaults(), updatedAt: null };
  }

  async updateNotificationPreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
    return {
      dealAlerts: prefs.dealAlerts,
      savingsSummary: prefs.savingsSummary,
      membershipReminders: prefs.membershipReminders,
      referralUpdates: prefs.referralUpdates,
      marketing: prefs.marketing,
      updatedAt: prefs.updatedAt,
    };
  }

  /** Upload/replace the signed-in user's avatar image (multipart field `avatar`). */
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'An avatar image file is required.' });
    }
    if (!AVATAR_MIME.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_TYPE',
        message: `Avatar must be one of: ${AVATAR_MIME.join(', ')}.`,
      });
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException({ code: 'IMAGE_TOO_LARGE', message: 'Avatar must be 3 MB or smaller.' });
    }
    const uploaded = await this.storage.upload({
      filename: file.originalname || 'avatar',
      mimetype: file.mimetype,
      buffer: file.buffer,
      folder: 'avatars',
    });
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, avatar: uploaded.url },
      update: { avatar: uploaded.url },
    });
    return { url: uploaded.url };
  }
}
