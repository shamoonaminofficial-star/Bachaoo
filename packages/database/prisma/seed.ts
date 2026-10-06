// ============================================================================
// DEVELOPMENT SEED DATA ONLY — not for production.
// Bachatly demo dataset: invented Pakistani brands, locations and offers.
// All business names, people and brands below are fictional and original.
// Re-running this script is safe: it upserts / guards on unique fields.
// ============================================================================

import {
  ApplicationStatus,
  DealStatus,
  DealType,
  PrismaClient,
  StaffRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function referralCode(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rand}`;
}

async function getOrCreateProvince(countryId: string, name: string) {
  const existing = await prisma.province.findFirst({
    where: { countryId, name },
  });
  if (existing) return existing;
  return prisma.province.create({ data: { countryId, name } });
}

async function upsertCity(
  provinceId: string,
  name: string,
  opts: { isDefault?: boolean } = {},
) {
  return prisma.city.upsert({
    where: { slug: slugify(name) },
    update: { name, provinceId, isDefault: opts.isDefault ?? false, isActive: true },
    create: {
      provinceId,
      name,
      slug: slugify(name),
      isDefault: opts.isDefault ?? false,
      isActive: true,
    },
  });
}

async function upsertArea(cityId: string, name: string) {
  return prisma.area.upsert({
    where: { cityId_slug: { cityId, slug: slugify(name) } },
    update: { name, isActive: true },
    create: { cityId, name, slug: slugify(name), isActive: true },
  });
}

async function upsertCategory(name: string, slug: string, sortOrder: number) {
  return prisma.category.upsert({
    where: { slug },
    update: { name, sortOrder, isActive: true, deletedAt: null },
    create: { name, slug, sortOrder, isActive: true },
  });
}

async function upsertSubcategory(
  categoryId: string,
  name: string,
  sortOrder: number,
) {
  const slug = slugify(name);
  return prisma.subcategory.upsert({
    where: { categoryId_slug: { categoryId, slug } },
    update: { name, sortOrder, isActive: true },
    create: { categoryId, name, slug, sortOrder, isActive: true },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // --- Country ------------------------------------------------------------
  const pakistan = await prisma.country.upsert({
    where: { code: 'PK' },
    update: { name: 'Pakistan', currency: 'PKR', timezone: 'Asia/Karachi', isActive: true },
    create: {
      name: 'Pakistan',
      code: 'PK',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      isActive: true,
    },
  });
  console.log(`Country: ${pakistan.name} (${pakistan.code})`);

  // --- Provinces -----------------------------------------------------------
  const provinceNames = [
    'Punjab',
    'Sindh',
    'Khyber Pakhtunkhwa',
    'Balochistan',
    'Islamabad Capital Territory',
  ];
  const provinces: Record<string, { id: string }> = {};
  for (const name of provinceNames) {
    const p = await getOrCreateProvince(pakistan.id, name);
    provinces[name] = p;
  }
  console.log(`Provinces: ${provinceNames.length}`);

  // --- Cities + Areas ------------------------------------------------------
  const citySeed: Array<{
    name: string;
    province: string;
    isDefault?: boolean;
    areas: string[];
  }> = [
    {
      name: 'Sargodha',
      province: 'Punjab',
      isDefault: true,
      areas: ['University Road', 'Satellite Town', 'Model Town', 'Qenchi Mor'],
    },
    {
      name: 'Lahore',
      province: 'Punjab',
      areas: ['Gulberg', 'DHA Phase 5', 'Johar Town', 'Model Town'],
    },
    {
      name: 'Islamabad',
      province: 'Islamabad Capital Territory',
      areas: ['F-7', 'G-9', 'Bahria Town', 'Blue Area'],
    },
    {
      name: 'Rawalpindi',
      province: 'Punjab',
      areas: ['Satellite Town', 'Bahria Town', 'Saddar', 'Chaklala'],
    },
    {
      name: 'Faisalabad',
      province: 'Punjab',
      areas: ['D Ground', 'Gulberg', 'Model City', 'Satiana Road'],
    },
    {
      name: 'Karachi',
      province: 'Sindh',
      areas: ['DHA Phase 6', 'Gulshan-e-Iqbal', 'Clifton', 'North Nazimabad'],
    },
  ];

  const cityBySlug: Record<string, { id: string }> = {};
  const areaByKey: Record<string, { id: string }> = {};
  let areaCount = 0;
  for (const c of citySeed) {
    const city = await upsertCity(provinces[c.province].id, c.name, {
      isDefault: c.isDefault,
    });
    cityBySlug[slugify(c.name)] = city;
    for (const areaName of c.areas) {
      const area = await upsertArea(city.id, areaName);
      areaByKey[`${slugify(c.name)}/${slugify(areaName)}`] = area;
      areaCount++;
    }
  }
  console.log(`Cities: ${citySeed.length}, Areas: ${areaCount}`);

  // --- Categories + Subcategories ------------------------------------------
  const categorySeed: Array<{ name: string; slug: string; subs: string[] }> = [
    { name: 'Food & Restaurants', slug: 'food-restaurants', subs: ['Pizza', 'Burgers', 'BBQ & Desi'] },
    { name: 'Cafe & Desserts', slug: 'cafe-desserts', subs: ['Coffee', 'Bakery', 'Ice Cream'] },
    { name: 'Grocery', slug: 'grocery', subs: ['Fresh Produce', 'Dairy & Eggs'] },
    { name: 'Fashion', slug: 'fashion', subs: ['Men', 'Women', 'Kids'] },
    { name: 'Beauty & Salon', slug: 'beauty-salon', subs: ['Hair', 'Skin Care'] },
    { name: 'Health & Wellness', slug: 'health-wellness', subs: ['Pharmacy', 'Gym & Fitness'] },
    { name: 'Automotive', slug: 'automotive', subs: ['Car Wash', 'Repair & Maintenance'] },
    { name: 'Entertainment', slug: 'entertainment', subs: ['Cinema', 'Gaming Zone'] },
    { name: 'Sports', slug: 'sports', subs: ['Cricket', 'Football'] },
    { name: 'Hotels', slug: 'hotels', subs: ['Budget Stays', 'Luxury Hotels'] },
    { name: 'Travel', slug: 'travel', subs: ['Bus Tickets', 'Tour Packages'] },
    { name: 'Education', slug: 'education', subs: ['Language Courses', 'Test Prep'] },
    { name: 'Electronics', slug: 'electronics', subs: ['Mobiles', 'Accessories'] },
    { name: 'Home Services', slug: 'home-services', subs: ['Plumbing', 'Electrician'] },
    { name: 'Professional Services', slug: 'professional-services', subs: ['Legal', 'Accounting'] },
  ];

  const categoryBySlug: Record<string, { id: string }> = {};
  const subcategoryByKey: Record<string, { id: string }> = {};
  let subCount = 0;
  for (let i = 0; i < categorySeed.length; i++) {
    const c = categorySeed[i];
    const category = await upsertCategory(c.name, c.slug, i + 1);
    categoryBySlug[c.slug] = category;
    for (let j = 0; j < c.subs.length; j++) {
      const sub = await upsertSubcategory(category.id, c.subs[j], j + 1);
      subcategoryByKey[`${c.slug}/${slugify(c.subs[j])}`] = sub;
      subCount++;
    }
  }
  console.log(`Categories: ${categorySeed.length}, Subcategories: ${subCount}`);

  // --- Roles & Permissions ---------------------------------------------------
  const permissionSeed: Array<{ key: string; group: string; description: string }> = [
    { key: 'user.read', group: 'Users', description: 'View users' },
    { key: 'user.update', group: 'Users', description: 'Update users' },
    { key: 'user.suspend', group: 'Users', description: 'Suspend / reinstate users' },
    { key: 'business.read', group: 'Businesses', description: 'View businesses' },
    { key: 'business.create', group: 'Businesses', description: 'Create businesses' },
    { key: 'business.update', group: 'Businesses', description: 'Update businesses' },
    { key: 'business.approve', group: 'Businesses', description: 'Approve / reject business applications' },
    { key: 'deal.read', group: 'Deals', description: 'View deals' },
    { key: 'deal.create', group: 'Deals', description: 'Create deals' },
    { key: 'deal.update', group: 'Deals', description: 'Update deals' },
    { key: 'deal.approve', group: 'Deals', description: 'Approve / reject deals' },
    { key: 'payment.read', group: 'Payments', description: 'View payments' },
    { key: 'payment.refund', group: 'Payments', description: 'Issue refunds' },
    { key: 'payment.verify', group: 'Payments', description: 'Verify manual payments' },
    { key: 'membership.read', group: 'Memberships', description: 'View membership plans and memberships' },
    { key: 'membership.manage', group: 'Memberships', description: 'Create plans; assign, extend, cancel memberships' },
    { key: 'settlement.read', group: 'Settlements', description: 'View settlements' },
    { key: 'settlement.manage', group: 'Settlements', description: 'Create / pay settlements' },
    { key: 'admin.manage', group: 'Admin', description: 'Manage admins, roles and settings' },
    { key: 'cms.manage', group: 'CMS', description: 'Manage banners and CMS pages' },
    { key: 'campaign.send', group: 'Marketing', description: 'Create and send campaigns' },
    { key: 'report.view', group: 'Reports', description: 'View reports and analytics' },
  ];
  const permissionByKey: Record<string, { id: string }> = {};
  for (const p of permissionSeed) {
    const perm = await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description, group: p.group },
      create: { key: p.key, description: p.description, group: p.group },
    });
    permissionByKey[p.key] = perm;
  }

  const allKeys = permissionSeed.map((p) => p.key);
  const roleSeed: Array<{ name: string; description: string; permissions: string[] }> = [
    { name: 'SUPER_ADMIN', description: 'Full platform access', permissions: allKeys },
    {
      name: 'ADMIN',
      description: 'Platform administrator',
      permissions: allKeys.filter((k) => k !== 'admin.manage'),
    },
    { name: 'CUSTOMER', description: 'Default app customer', permissions: [] },
    {
      name: 'BUSINESS_OWNER',
      description: 'Owns and manages their businesses',
      permissions: ['business.read', 'business.update', 'deal.read', 'deal.create', 'deal.update', 'report.view'],
    },
    {
      name: 'BUSINESS_MANAGER',
      description: 'Manages day-to-day deals for a business',
      permissions: ['business.read', 'deal.read', 'deal.create', 'deal.update', 'report.view'],
    },
    { name: 'CASHIER', description: 'Confirms redemptions at checkout', permissions: ['deal.read'] },
    { name: 'SCANNER', description: 'Scans QR tokens at the counter', permissions: ['deal.read'] },
    {
      name: 'SUPPORT_AGENT',
      description: 'Handles customer support tickets',
      permissions: ['user.read', 'user.update', 'business.read', 'deal.read', 'payment.read', 'membership.read', 'report.view'],
    },
    {
      name: 'CONTENT_MANAGER',
      description: 'Curates deals, banners and pages',
      permissions: ['business.read', 'deal.read', 'deal.approve', 'cms.manage', 'campaign.send'],
    },
    {
      name: 'FINANCE_MANAGER',
      description: 'Payments, refunds and settlements',
      permissions: ['payment.read', 'payment.refund', 'payment.verify', 'membership.read', 'membership.manage', 'settlement.read', 'settlement.manage', 'report.view'],
    },
    {
      name: 'MARKETING_MANAGER',
      description: 'Campaigns and merchandising',
      permissions: ['business.read', 'deal.read', 'cms.manage', 'campaign.send', 'report.view'],
    },
  ];

  const roleByName: Record<string, { id: string }> = {};
  for (const r of roleSeed) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: { name: r.name, description: r.description },
    });
    roleByName[r.name] = role;
    // Sync permission links idempotently.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (r.permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: r.permissions.map((key) => ({
          roleId: role.id,
          permissionId: permissionByKey[key].id,
        })),
      });
    }
  }
  console.log(`Roles: ${roleSeed.length}, Permissions: ${permissionSeed.length}`);

  async function upsertUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    citySlug?: string;
    password?: string;
    roles?: string[];
  }) {
    const passwordHash = input.password
      ? bcrypt.hashSync(input.password, 10)
      : undefined;
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.citySlug && cityBySlug[input.citySlug]
          ? { cityId: cityBySlug[input.citySlug].id }
          : {}),
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        cityId: input.citySlug && cityBySlug[input.citySlug] ? cityBySlug[input.citySlug].id : undefined,
        passwordHash,
        referralCode: referralCode('BCH'),
        emailVerifiedAt: new Date(),
      },
    });
    for (const roleName of input.roles ?? []) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roleByName[roleName].id } },
        update: {},
        create: { userId: user.id, roleId: roleByName[roleName].id },
      });
    }
    // Ensure wallet + reward account exist.
    await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, balance: 0 },
    });
    await prisma.rewardAccount.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    return user;
  }

  // --- Admin -----------------------------------------------------------------
  const admin = await upsertUser({
    email: 'admin@bachatly.pk',
    firstName: 'Bachatly',
    lastName: 'Admin',
    phone: '+923001234567',
    citySlug: 'sargodha',
    password: 'Bachatly@123',
    roles: ['SUPER_ADMIN'],
  });
  console.log(`Admin user: ${admin.email}`);

  // --- Businesses (all fictional, original brands) ---------------------------
  const businessSeed: Array<{
    slug: string;
    name: string;
    description: string;
    categorySlug: string;
    citySlug: string;
    ownerEmail: string;
    ownerFirst: string;
    ownerLast: string;
    phone: string;
    ratingAvg: number;
    ratingCount: number;
    branches: Array<{
      name: string;
      areaKey: string;
      address: string;
      phone: string;
      latitude: number;
      longitude: number;
      openingHours: Record<string, [string, string]>;
    }>;
  }> = [
    {
      slug: 'urban-slice',
      name: 'Urban Slice',
      description:
        "Sargodha's homegrown pizza spot — hand-tossed dough, loaded fries and a buzzing family hall on University Road.",
      categorySlug: 'food-restaurants',
      citySlug: 'sargodha',
      ownerEmail: 'owner@urbanslice.pk',
      ownerFirst: 'Danish',
      ownerLast: 'Raza',
      phone: '+92483721001',
      ratingAvg: 4.6,
      ratingCount: 212,
      branches: [
        {
          name: 'University Road Branch',
          areaKey: 'sargodha/university-road',
          address: '12-A University Road, Sargodha',
          phone: '+92483721001',
          latitude: 32.0875,
          longitude: 72.6748,
          openingHours: { mon: ['12:00', '23:00'], tue: ['12:00', '23:00'], wed: ['12:00', '23:00'], thu: ['12:00', '23:00'], fri: ['13:00', '23:30'], sat: ['12:00', '23:30'], sun: ['12:00', '23:00'] },
        },
        {
          name: 'Satellite Town Branch',
          areaKey: 'sargodha/satellite-town',
          address: 'Block C, Satellite Town, Sargodha',
          phone: '+92483721002',
          latitude: 32.075,
          longitude: 72.682,
          openingHours: { mon: ['12:00', '22:30'], tue: ['12:00', '22:30'], wed: ['12:00', '22:30'], thu: ['12:00', '22:30'], fri: ['13:00', '23:00'], sat: ['12:00', '23:00'], sun: ['12:00', '22:30'] },
        },
      ],
    },
    {
      slug: 'glownest-salon',
      name: 'GlowNest Salon',
      description:
        'A calm, modern salon in Gulberg offering precision haircuts, signature facials and bridal prep — walk-ins welcome.',
      categorySlug: 'beauty-salon',
      citySlug: 'lahore',
      ownerEmail: 'owner@glownest.pk',
      ownerFirst: 'Mahnoor',
      ownerLast: 'Khan',
      phone: '+92423578010',
      ratingAvg: 4.8,
      ratingCount: 167,
      branches: [
        {
          name: 'Gulberg Flagship',
          areaKey: 'lahore/gulberg',
          address: '45-B Main Boulevard, Gulberg III, Lahore',
          phone: '+92423578010',
          latitude: 31.51,
          longitude: 74.35,
          openingHours: { mon: ['10:00', '20:00'], tue: ['10:00', '20:00'], wed: ['10:00', '20:00'], thu: ['10:00', '20:00'], fri: ['10:00', '20:00'], sat: ['10:00', '21:00'], sun: ['11:00', '19:00'] },
        },
      ],
    },
    {
      slug: 'autocare-plus',
      name: 'AutoCare Plus',
      description:
        'Full-service car care in G-9 — detailing, oil change, denting-painting and pre-purchase inspections with upfront pricing.',
      categorySlug: 'automotive',
      citySlug: 'islamabad',
      ownerEmail: 'owner@autocareplus.pk',
      ownerFirst: 'Fahad',
      ownerLast: 'Iqbal',
      phone: '+92512284020',
      ratingAvg: 4.5,
      ratingCount: 98,
      branches: [
        {
          name: 'G-9 Service Center',
          areaKey: 'islamabad/g-9',
          address: 'Plot 7, Service Road West, G-9/1, Islamabad',
          phone: '+92512284020',
          latitude: 33.664,
          longitude: 72.926,
          openingHours: { mon: ['09:00', '19:00'], tue: ['09:00', '19:00'], wed: ['09:00', '19:00'], thu: ['09:00', '19:00'], fri: ['09:00', '19:00'], sat: ['09:00', '18:00'], sun: ['10:00', '16:00'] },
        },
      ],
    },
    {
      slug: 'threadline-fashion',
      name: 'ThreadLine Fashion',
      description:
        'Everyday Eastern wear with a modern cut — kurtis, co-ords and festive edits stitched for Karachi weather.',
      categorySlug: 'fashion',
      citySlug: 'karachi',
      ownerEmail: 'owner@threadline.pk',
      ownerFirst: 'Areeba',
      ownerLast: 'Siddiqui',
      phone: '+92213586030',
      ratingAvg: 4.4,
      ratingCount: 143,
      branches: [
        {
          name: 'DHA Phase 6 Store',
          areaKey: 'karachi/dha-phase-6',
          address: 'Shop 4, Bukhari Commercial, DHA Phase 6, Karachi',
          phone: '+92213586030',
          latitude: 24.815,
          longitude: 67.075,
          openingHours: { mon: ['11:00', '22:00'], tue: ['11:00', '22:00'], wed: ['11:00', '22:00'], thu: ['11:00', '22:00'], fri: ['14:00', '22:00'], sat: ['11:00', '23:00'], sun: ['11:00', '22:00'] },
        },
      ],
    },
    {
      slug: 'freshkart-daily',
      name: 'FreshKart Daily',
      description:
        'Faisalabad’s neighbourhood grocery — farm-fresh produce every morning, honest weights and same-day home delivery.',
      categorySlug: 'grocery',
      citySlug: 'faisalabad',
      ownerEmail: 'owner@freshkart.pk',
      ownerFirst: 'Usman',
      ownerLast: 'Tariq',
      phone: '+92418712040',
      ratingAvg: 4.7,
      ratingCount: 189,
      branches: [
        {
          name: 'D Ground Mart',
          areaKey: 'faisalabad/d-ground',
          address: '45 D Ground, Peoples Colony, Faisalabad',
          phone: '+92418712040',
          latitude: 31.416,
          longitude: 73.07,
          openingHours: { mon: ['08:00', '23:00'], tue: ['08:00', '23:00'], wed: ['08:00', '23:00'], thu: ['08:00', '23:00'], fri: ['08:00', '23:00'], sat: ['08:00', '23:00'], sun: ['08:00', '23:00'] },
        },
      ],
    },
    {
      slug: 'pixelplay-arena',
      name: 'PixelPlay Arena',
      description:
        'Rawalpindi’s loudest gaming lounge — PS5 pods, racing sims, VR zone and a snack bar for the breaks between matches.',
      categorySlug: 'entertainment',
      citySlug: 'rawalpindi',
      ownerEmail: 'owner@pixelplay.pk',
      ownerFirst: 'Hamza',
      ownerLast: 'Sheikh',
      phone: '+92515517050',
      ratingAvg: 4.6,
      ratingCount: 231,
      branches: [
        {
          name: 'Saddar Gaming Lounge',
          areaKey: 'rawalpindi/saddar',
          address: '2nd Floor, City Plaza, Saddar, Rawalpindi',
          phone: '+92515517050',
          latitude: 33.596,
          longitude: 73.052,
          openingHours: { mon: ['12:00', '00:00'], tue: ['12:00', '00:00'], wed: ['12:00', '00:00'], thu: ['12:00', '00:00'], fri: ['12:00', '01:00'], sat: ['11:00', '01:00'], sun: ['11:00', '00:00'] },
        },
      ],
    },
  ];

  const businessBySlug: Record<string, { id: string }> = {};
  const branchIdsByBusiness: Record<string, string[]> = {};
  let branchCount = 0;

  for (const b of businessSeed) {
    const owner = await upsertUser({
      email: b.ownerEmail,
      firstName: b.ownerFirst,
      lastName: b.ownerLast,
      phone: b.phone,
      citySlug: b.citySlug,
      roles: ['BUSINESS_OWNER'],
    });

    const business = await prisma.business.upsert({
      where: { slug: b.slug },
      update: {
        name: b.name,
        description: b.description,
        categoryId: categoryBySlug[b.categorySlug].id,
        ownerUserId: owner.id,
        phone: b.phone,
        isVerified: true,
        isActive: true,
        applicationStatus: ApplicationStatus.APPROVED,
        ratingAvg: b.ratingAvg,
        ratingCount: b.ratingCount,
        deletedAt: null,
      },
      create: {
        slug: b.slug,
        name: b.name,
        description: b.description,
        categoryId: categoryBySlug[b.categorySlug].id,
        ownerUserId: owner.id,
        phone: b.phone,
        isVerified: true,
        isActive: true,
        applicationStatus: ApplicationStatus.APPROVED,
        ratingAvg: b.ratingAvg,
        ratingCount: b.ratingCount,
      },
    });
    businessBySlug[b.slug] = business;

    await prisma.businessOwner.upsert({
      where: { businessId_userId: { businessId: business.id, userId: owner.id } },
      update: { role: StaffRole.OWNER },
      create: { businessId: business.id, userId: owner.id, role: StaffRole.OWNER },
    });

    branchIdsByBusiness[b.slug] = [];
    for (const br of b.branches) {
      const existing = await prisma.branch.findFirst({
        where: { businessId: business.id, name: br.name },
      });
      const branch =
        existing ??
        (await prisma.branch.create({
          data: {
            businessId: business.id,
            name: br.name,
            managerName: `${b.ownerFirst} ${b.ownerLast}`,
            phone: br.phone,
            address: br.address,
            cityId: cityBySlug[b.citySlug].id,
            areaId: areaByKey[br.areaKey]?.id,
            latitude: br.latitude,
            longitude: br.longitude,
            openingHours: br.openingHours,
            isActive: true,
          },
        }));
      branchIdsByBusiness[b.slug].push(branch.id);
      branchCount++;
    }
  }
  console.log(`Businesses: ${businessSeed.length}, Branches: ${branchCount}`);

  // --- Membership plans ------------------------------------------------------
  const planSeed = [
    {
      slug: 'starter',
      name: 'Starter',
      description: 'A light plan for trying out member-only deals around your city.',
      regularPrice: 49900, // Rs. 499
      salePrice: 49900,
      durationDays: 30,
      benefits: [
        'Up to 20% off at partner restaurants',
        'Member-only flash vouchers every week',
        'Savings tracker in the app',
      ],
      rewardMultiplierBps: 10000,
      cashbackPercent: 0,
      isFeatured: false,
    },
    {
      slug: 'premium',
      name: 'Premium',
      description: 'Our most loved plan — bigger discounts, cashback and priority support.',
      regularPrice: 199900, // Rs. 1,999
      salePrice: 149900, // Rs. 1,499
      durationDays: 180,
      benefits: [
        'Up to 40% off across all categories',
        '5% cashback on every redemption',
        '2x reward points on dining deals',
        'Priority customer support',
      ],
      rewardMultiplierBps: 20000,
      cashbackPercent: 5,
      isFeatured: true,
    },
    {
      slug: 'family',
      name: 'Family',
      description: 'One plan for the whole household — share the savings with up to 4 members.',
      regularPrice: 349900, // Rs. 3,499
      salePrice: 249900, // Rs. 2,499
      durationDays: 365,
      benefits: [
        'Up to 50% off across all categories',
        '7% cashback on every redemption',
        'Shareable with up to 4 family members',
        'Free birthday vouchers for each member',
        'Dedicated family support line',
      ],
      rewardMultiplierBps: 25000,
      cashbackPercent: 7,
      isFeatured: false,
    },
  ];

  for (const p of planSeed) {
    await prisma.membershipPlan.upsert({
      where: { slug: p.slug },
      update: { ...p, isActive: true, deletedAt: null },
      create: { ...p, isActive: true },
    });
  }
  console.log(`Membership plans: ${planSeed.length}`);

  // --- Sample deal -------------------------------------------------------------
  const urbanSlice = businessBySlug['urban-slice'];
  const foodCat = categoryBySlug['food-restaurants'];
  const pizzaSub = subcategoryByKey['food-restaurants/pizza'];
  const now = new Date();
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const deal = await prisma.deal.upsert({
    where: { slug: '20-percent-off-premium-pizza-deal' },
    update: {
      status: DealStatus.PUBLISHED,
      startDate: now,
      endDate: sixtyDays,
      deletedAt: null,
    },
    create: {
      businessId: urbanSlice.id,
      categoryId: foodCat.id,
      subcategoryId: pizzaSub.id,
      slug: '20-percent-off-premium-pizza-deal',
      title: '20% OFF Premium Pizza Deal',
      description:
        'Flat 20% off on every large premium pizza at Urban Slice — from the smoky Chicken Tikka to the fully loaded Urban Special. Dine-in and takeaway, all week.',
      shortDescription: 'Flat 20% off all large premium pizzas, dine-in & takeaway.',
      dealType: DealType.PERCENT_OFF,
      discountPercent: 20,
      maxDiscountAmount: 50000, // Rs. 500 cap
      originalPrice: 149900, // Rs. 1,499
      requiresMembership: true,
      eligiblePlanIds: [],
      status: DealStatus.PUBLISHED,
      startDate: now,
      endDate: sixtyDays,
      daysAvailable: [],
      perUserLimit: 2,
      terms:
        'Valid for active members. Cannot be combined with another promotional offer. Subject to participating branch conditions.',
    },
  });

  const existingImages = await prisma.dealImage.count({ where: { dealId: deal.id } });
  if (existingImages === 0) {
    await prisma.dealImage.createMany({
      data: [
        { dealId: deal.id, url: 'https://cdn.bachatly.pk/deals/urban-slice-pizza-1.jpg', sortOrder: 1 },
        { dealId: deal.id, url: 'https://cdn.bachatly.pk/deals/urban-slice-pizza-2.jpg', sortOrder: 2 },
      ],
    });
  }
  for (const branchId of branchIdsByBusiness['urban-slice']) {
    await prisma.dealBranch.upsert({
      where: { dealId_branchId: { dealId: deal.id, branchId } },
      update: {},
      create: { dealId: deal.id, branchId },
    });
  }
  console.log(`Sample deal: ${deal.slug} (${deal.status})`);

  // --- Platform settings (dev defaults; admin can change via settings UI) ----
  const settingSeed: Array<{ key: string; value: unknown; description: string }> = [
    {
      key: 'bank_accounts',
      value: [
        {
          bankName: 'Demo Bank (replace in Admin → Settings)',
          accountTitle: 'Bachatly Demo Account',
          iban: 'PK00DEMO0000000000000000',
          note: 'Demo placeholder — configure real accounts before launch.',
          isActive: true,
        },
      ],
      description: 'Bank accounts shown for manual transfers (JSON array).',
    },
    { key: 'signup.reward_points', value: 100, description: 'Points awarded on first membership activation.' },
    { key: 'referral.reward_points', value: 500, description: 'Points awarded to the referrer on the referred user’s first paid membership.' },
    { key: 'reviews.autoApprove', value: false, description: 'When true, customer reviews skip the moderation queue. Default false (manual moderation).' },
    { key: 'notifications.expiry_reminder_days', value: 7, description: 'Days ahead to remind members their membership is expiring (daily cron).' },
  ];
  for (const s of settingSeed) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value as never, description: s.description },
    });
  }
  console.log(`Settings: ${settingSeed.length}`);

  // --- CMS: legal/content pages (DRAFT — original placeholder copy, NOT legal
  // advice; the business owner must replace these with reviewed legal text
  // before launch) ------------------------------------------------------------
  const pageSeed: Array<{ slug: string; title: string; content: string }> = [
    {
      slug: 'terms',
      title: 'Terms of Service',
      content: [
        '# Terms of Service (DRAFT — replace with reviewed legal text before launch)',
        '',
        'Welcome to Bachatly. These placeholder terms describe how the platform works; they are not legal advice.',
        '',
        '## Memberships',
        'A Bachatly membership gives you access to partner discounts shown in the app. Memberships are personal, non-transferable, and valid for the period shown on your plan.',
        '',
        '## Discounts and redemptions',
        'Discounts are honoured by partner businesses at their branches, subject to each deal’s terms (valid days, timings, and limits). The QR code shown in the app is single-use and expires quickly; screenshots cannot be reused.',
        '',
        '## Payments and refunds',
        'Membership fees are collected via the payment methods shown at checkout. Refund requests are reviewed case by case through support.',
        '',
        '## Fair use',
        'Abuse of the platform — including sharing QR codes, fake reviews, or fraudulent redemptions — may lead to suspension.',
      ].join('\n'),
    },
    {
      slug: 'privacy',
      title: 'Privacy Policy',
      content: [
        '# Privacy Policy (DRAFT — replace with reviewed legal text before launch)',
        '',
        'This placeholder policy explains, in plain language, what data Bachatly collects and why.',
        '',
        '## What we collect',
        'Your name, contact details, city, membership and redemption history, and support messages — only what the app needs to work.',
        '',
        '## How we use it',
        'To run your membership, show nearby deals, calculate savings, prevent fraud, and send the notifications you opted into.',
        '',
        '## Your choices',
        'You can update your profile, manage notification preferences, and ask support to close your account at any time.',
      ].join('\n'),
    },
    {
      slug: 'about',
      title: 'About Bachatly',
      content: [
        '# About Bachatly',
        '',
        'Bachatly — “Save More. Live More.” — is a Pakistan-first membership platform that unlocks real discounts at local businesses: restaurants, salons, clinics, retail and more.',
        '',
        'Members show a short-lived QR code at partner outlets, the partner confirms the bill, and the discount, cashback and reward points are calculated automatically.',
        '',
        'Businesses get a partner dashboard with redemptions, analytics and staff management — no hardware needed, just a phone.',
      ].join('\n'),
    },
    {
      slug: 'contact',
      title: 'Contact Us',
      content: [
        '# Contact Us',
        '',
        'Questions about your membership, a deal, or a payment? Reach us any time:',
        '',
        '- In-app: open Support in your account and create a ticket.',
        '- Email: support@bachatly.example (replace with the real address before launch).',
        '',
        'We aim to reply within one business day.',
      ].join('\n'),
    },
  ];
  for (const p of pageSeed) {
    await prisma.cMSPage.upsert({
      where: { slug: p.slug },
      update: {},
      create: { slug: p.slug, title: p.title, content: p.content, isPublished: false },
    });
  }
  console.log(`CMS pages (draft): ${pageSeed.length}`);

  // --- FAQ entries (published; also power GET /support/faq) -------------------
  const faqSeed: Array<{ category: string; question: string; answer: string; sortOrder: number }> = [
    { category: 'Membership', question: 'How does a Bachatly membership work?', answer: 'Pick a plan, pay once, and show your QR code at any partner outlet to get the listed discount. Your savings, cashback and points are tracked automatically in the app.', sortOrder: 1 },
    { category: 'Membership', question: 'Can I share my membership with family?', answer: 'No — memberships are personal and linked to your account. The QR code is single-use and tied to you.', sortOrder: 2 },
    { category: 'Redemption', question: 'My QR code expired before the cashier scanned it. What now?', answer: 'Just tap “Redeem” again on the deal page to generate a fresh code. Codes expire after about 90 seconds for your security and cannot be screenshotted for reuse.', sortOrder: 1 },
    { category: 'Redemption', question: 'Can I use two deals at the same outlet in one visit?', answer: 'Usually one deal per bill. Check each deal’s terms — some allow stacking, most do not.', sortOrder: 2 },
    { category: 'Payments', question: 'Which payment methods are accepted?', answer: 'Bank transfer is available at launch. JazzCash and Easypaisa are coming soon — watch the checkout page for updates.', sortOrder: 1 },
    { category: 'Payments', question: 'I paid by bank transfer but my membership is not active.', answer: 'After transferring, upload your receipt on the checkout page. An admin verifies it (usually within a few hours) and your membership activates automatically.', sortOrder: 2 },
    { category: 'Rewards', question: 'How do reward points and cashback work?', answer: 'Every confirmed redemption earns points and, on eligible plans, cashback. Points can be redeemed for vouchers from the Rewards page; cashback can be withdrawn once it is approved.', sortOrder: 1 },
    { category: 'Account', question: 'How do I change my notification preferences?', answer: 'Open Account → Notifications and toggle each topic. Support replies and security messages are always delivered.', sortOrder: 1 },
  ];
  for (const f of faqSeed) {
    const slug = `seed-faq-${f.category.toLowerCase()}-${f.sortOrder}`;
    await prisma.faqEntry.upsert({
      where: { slug },
      update: {},
      create: { slug, category: f.category, question: f.question, answer: f.answer, sortOrder: f.sortOrder, isPublished: true },
    });
  }
  console.log(`FAQ entries: ${faqSeed.length}`);

  // --- Summary -----------------------------------------------------------------
  const counts = {
    countries: await prisma.country.count(),
    provinces: await prisma.province.count(),
    cities: await prisma.city.count(),
    areas: await prisma.area.count(),
    categories: await prisma.category.count(),
    subcategories: await prisma.subcategory.count(),
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    users: await prisma.user.count(),
    businesses: await prisma.business.count(),
    branches: await prisma.branch.count(),
    membershipPlans: await prisma.membershipPlan.count(),
    deals: await prisma.deal.count(),
  };
  console.log('Seed complete:', JSON.stringify(counts));
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
