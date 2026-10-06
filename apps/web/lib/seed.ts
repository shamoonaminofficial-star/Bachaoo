/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DEV-ONLY SEED DATA — NOT FOR PRODUCTION
 * ═══════════════════════════════════════════════════════════════════════════
 * Mirrors the backend seed for local development. The UI renders this only
 * when the API is unreachable (see lib/api.ts `withSeedFallback`), with a
 * console warning. Production builds must always hit the real API.
 */
import type { Business, Category, Deal, MembershipPlan, Redemption, Voucher } from '@bachatly/ui';

export const CITIES = ['Sargodha', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Karachi'];

export const SEED_CATEGORIES: Category[] = [
  { id: 'c1', name: 'Food & Restaurants', slug: 'food-restaurants', icon: '🍽️', order: 1, active: true },
  { id: 'c2', name: 'Cafe & Desserts', slug: 'cafe-desserts', icon: '☕', order: 2, active: true },
  { id: 'c3', name: 'Grocery', slug: 'grocery', icon: '🛒', order: 3, active: true },
  { id: 'c4', name: 'Fashion', slug: 'fashion', icon: '👗', order: 4, active: true },
  { id: 'c5', name: 'Beauty & Salon', slug: 'beauty-salon', icon: '💅', order: 5, active: true },
  { id: 'c6', name: 'Health & Wellness', slug: 'health-wellness', icon: '🏥', order: 6, active: true },
  { id: 'c7', name: 'Automotive', slug: 'automotive', icon: '🚗', order: 7, active: true },
  { id: 'c8', name: 'Entertainment', slug: 'entertainment', icon: '🎬', order: 8, active: true },
  { id: 'c9', name: 'Sports', slug: 'sports', icon: '⚽', order: 9, active: true },
  { id: 'c10', name: 'Hotels', slug: 'hotels', icon: '🏨', order: 10, active: true },
  { id: 'c11', name: 'Travel', slug: 'travel', icon: '✈️', order: 11, active: true },
  { id: 'c12', name: 'Education', slug: 'education', icon: '📚', order: 12, active: true },
  { id: 'c13', name: 'Electronics', slug: 'electronics', icon: '📱', order: 13, active: true },
  { id: 'c14', name: 'Home Services', slug: 'home-services', icon: '🔧', order: 14, active: true },
  { id: 'c15', name: 'Professional Services', slug: 'professional-services', icon: '💼', order: 15, active: true },
];

export const SEED_BUSINESSES: Business[] = [
  { id: 'b1', name: 'Urban Slice', slug: 'urban-slice', category: 'Food & Restaurants', rating: 4.6, reviewsCount: 212, city: 'Sargodha', area: 'University Road', address: '12-B University Road, Sargodha', phone: '048-3720001', verified: true, activeOffers: 3, memberDiscount: 'Up to 20% off', distanceKm: 1.2 },
  { id: 'b2', name: 'Glow & Grace Salon', slug: 'glow-grace-salon', category: 'Beauty & Salon', rating: 4.8, reviewsCount: 167, city: 'Lahore', area: 'DHA Phase 5', address: '45-C Commercial, DHA Phase 5, Lahore', phone: '042-35770002', verified: true, activeOffers: 2, memberDiscount: '15% off services', distanceKm: 2.4 },
  { id: 'b3', name: 'FreshMart Daily', slug: 'freshmart-daily', category: 'Grocery', rating: 4.4, reviewsCount: 389, city: 'Sargodha', area: 'Satellite Town', address: '8 Satellite Town Market, Sargodha', verified: true, activeOffers: 4, memberDiscount: '10% off weekends', distanceKm: 0.8 },
  { id: 'b4', name: 'Torque Auto Care', slug: 'torque-auto-care', category: 'Automotive', rating: 4.5, reviewsCount: 98, city: 'Islamabad', area: 'G-8 Markaz', address: 'Plot 7, G-8 Markaz, Islamabad', verified: true, activeOffers: 2, memberDiscount: '20% off detailing', distanceKm: 3.1 },
  { id: 'b5', name: 'ThreadLine Studio', slug: 'threadline-studio', category: 'Fashion', rating: 4.7, reviewsCount: 143, city: 'Karachi', area: 'Clifton', address: '2nd Floor, Clifton Centre, Karachi', verified: true, activeOffers: 3, memberDiscount: '25% off new arrivals', distanceKm: 5.6 },
  { id: 'b6', name: 'CineStar Lounge', slug: 'cinestar-lounge', category: 'Entertainment', rating: 4.3, reviewsCount: 501, city: 'Faisalabad', area: 'Kohinoor City', address: 'Kohinoor City Mall, Faisalabad', verified: false, activeOffers: 1, memberDiscount: 'Buy 1 Get 1 Tuesdays', distanceKm: 4.2 },
  { id: 'b7', name: 'Bean Theory Café', slug: 'bean-theory-cafe', category: 'Cafe & Desserts', rating: 4.9, reviewsCount: 276, city: 'Rawalpindi', area: 'Bahria Town', address: 'Civic Centre, Bahria Town Phase 4', verified: true, activeOffers: 2, memberDiscount: 'Free dessert Fridays', distanceKm: 1.9 },
  { id: 'b8', name: 'MediCare Pharmacy', slug: 'medicare-pharmacy', category: 'Health & Wellness', rating: 4.2, reviewsCount: 64, city: 'Sargodha', area: 'Civil Lines', address: '3 Civil Lines, Sargodha', verified: true, activeOffers: 1, memberDiscount: '12% off OTC', distanceKm: 2.0 },
];

const biz = (id: string) => {
  const b = SEED_BUSINESSES.find((x) => x.id === id)!;
  return { id: b.id, name: b.name, slug: b.slug, verified: b.verified, city: b.city, area: b.area };
};
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

export const SEED_DEALS: Deal[] = [
  { id: 'd1', slug: '20-percent-off-premium-pizza', title: '20% OFF Premium Pizza Deal', shortDescription: 'Members receive 20% off eligible menu items.', description: 'Show your Bachatly membership at Urban Slice and enjoy 20% off the entire premium pizza range, including family deals and sides.', discountPercent: 20, business: biz('b1'), category: 'Food & Restaurants', city: 'Sargodha', area: 'University Road', distanceKm: 1.2, badges: ['POPULAR', 'MEMBERS ONLY'], memberOnly: true, startsAt: new Date().toISOString(), expiresAt: future(21), terms: ['Valid for active members.', 'Cannot be combined with another promotional offer.', 'Subject to participating branch conditions.'], perUserLimit: 2, rating: 4.6 },
  { id: 'd2', slug: 'flat-15-percent-salon-services', title: 'Flat 15% Off All Salon Services', shortDescription: 'Hair, skin and bridal packages included.', description: 'Glow & Grace Salon offers Bachatly members a flat 15% off all salon services, Monday to Thursday.', discountPercent: 15, business: biz('b2'), category: 'Beauty & Salon', city: 'Lahore', area: 'DHA Phase 5', distanceKm: 2.4, badges: ['EXCLUSIVE'], memberOnly: true, startsAt: new Date().toISOString(), expiresAt: future(30), terms: ['Appointment required.', 'Not valid on products.'], perUserLimit: 4, rating: 4.8 },
  { id: 'd3', slug: 'weekend-grocery-10-percent', title: '10% Off Weekend Grocery Run', shortDescription: 'Every Saturday & Sunday on bills over Rs. 3,000.', description: 'Stock up for the week — 10% off your total bill every weekend at FreshMart Daily.', discountPercent: 10, originalPrice: 3000, business: biz('b3'), category: 'Grocery', city: 'Sargodha', area: 'Satellite Town', distanceKm: 0.8, badges: ['TRENDING'], memberOnly: false, startsAt: new Date().toISOString(), expiresAt: future(14), terms: ['Minimum bill Rs. 3,000.', 'Weekends only.'], perUserLimit: 8, rating: 4.4 },
  { id: 'd4', slug: 'car-detailing-20-percent', title: '20% Off Complete Car Detailing', shortDescription: 'Interior + exterior detailing package.', description: 'Torque Auto Care brings your car back to showroom shine with 20% off the complete detailing package.', discountPercent: 20, originalPrice: 8000, memberPrice: 6400, business: biz('b4'), category: 'Automotive', city: 'Islamabad', area: 'G-8 Markaz', distanceKm: 3.1, badges: ['LIMITED TIME'], memberOnly: true, startsAt: new Date().toISOString(), expiresAt: future(7), terms: ['Booking required 24h ahead.', 'SUVs excluded.'], perUserLimit: 1, rating: 4.5 },
  { id: 'd5', slug: 'fashion-fest-25-percent', title: '25% Off New Season Collection', shortDescription: 'Latest eastern & western wear.', description: 'ThreadLine Studio members get 25% off the brand-new season collection, in-store and online.', discountPercent: 25, business: biz('b5'), category: 'Fashion', city: 'Karachi', area: 'Clifton', distanceKm: 5.6, badges: ['NEW', 'POPULAR'], memberOnly: true, startsAt: new Date().toISOString(), expiresAt: future(25), terms: ['Not valid on sale items.'], perUserLimit: 3, rating: 4.7 },
  { id: 'd6', slug: 'movie-tuesday-bogo', title: 'Buy 1 Get 1 Movie Tickets', shortDescription: 'Every Tuesday at CineStar Lounge.', description: 'Double the fun — buy one ticket, get one free every Tuesday.', discountPercent: 50, business: biz('b6'), category: 'Entertainment', city: 'Faisalabad', area: 'Kohinoor City', distanceKm: 4.2, badges: ['TRENDING'], memberOnly: false, startsAt: new Date().toISOString(), expiresAt: future(60), terms: ['Tuesdays only.', 'Same movie, same show.'], perUserLimit: 2, rating: 4.3 },
  { id: 'd7', slug: 'free-dessert-friday', title: 'Free Dessert with Any Large Coffee', shortDescription: 'Friday treat at Bean Theory Café.', description: 'Order any large coffee on Friday and pick a dessert on the house.', discountPercent: 100, business: biz('b7'), category: 'Cafe & Desserts', city: 'Rawalpindi', area: 'Bahria Town', distanceKm: 1.9, badges: ['EXCLUSIVE', 'LIMITED TIME'], memberOnly: true, startsAt: new Date().toISOString(), expiresAt: future(10), terms: ['Fridays only.', 'One per member.'], perUserLimit: 4, rating: 4.9 },
  { id: 'd8', slug: 'pharmacy-12-percent-otc', title: '12% Off OTC Medicines', shortDescription: 'Vitamins, personal care & more.', description: 'MediCare Pharmacy offers 12% off over-the-counter medicines and personal care.', discountPercent: 12, business: biz('b8'), category: 'Health & Wellness', city: 'Sargodha', area: 'Civil Lines', distanceKm: 2.0, badges: ['NEW'], memberOnly: false, startsAt: new Date().toISOString(), expiresAt: future(45), terms: ['Prescription medicines excluded.'], perUserLimit: 10, rating: 4.2 },
];

export const SEED_PLANS: MembershipPlan[] = [
  { id: 'p1', name: 'Starter', description: 'Perfect for trying out member savings.', regularPrice: 1499, salePrice: 999, durationMonths: 3, benefits: ['Access to 500+ partner businesses', 'Member-only deals & vouchers', '1× reward points on redemptions', 'Digital membership card'], rewardMultiplier: 1, cashbackPercent: 2, featured: false, active: true },
  { id: 'p2', name: 'Premium', description: 'Our most loved plan for regular savers.', regularPrice: 3499, salePrice: 2499, durationMonths: 12, benefits: ['Everything in Starter', '2× reward points on redemptions', '5% cashback on eligible deals', 'Priority partner offers', 'Birthday month bonus voucher'], rewardMultiplier: 2, cashbackPercent: 5, featured: true, active: true },
  { id: 'p3', name: 'Family', description: 'One plan for the whole household — up to 4 members.', regularPrice: 5999, salePrice: 4499, durationMonths: 12, benefits: ['Everything in Premium', '4 member cards included', '3× reward points on redemptions', '7% cashback on eligible deals', 'Family savings dashboard'], rewardMultiplier: 3, cashbackPercent: 7, featured: false, active: true },
];

export const SEED_VOUCHERS: Voucher[] = [
  { id: 'v1', title: 'Rs. 500 Grocery Voucher', businessName: 'FreshMart Daily', value: 500, code: 'BCH-GRC-500A', expiresAt: future(20), status: 'available', kind: 'Reward-based' },
  { id: 'v2', title: 'Free Large Pizza Voucher', businessName: 'Urban Slice', value: 1200, code: 'BCH-PIZ-FREE1', expiresAt: future(12), status: 'available', kind: 'Promotional' },
  { id: 'v3', title: 'Rs. 300 Salon Voucher', businessName: 'Glow & Grace Salon', value: 300, code: 'BCH-SLN-300X', expiresAt: future(-2), status: 'expired', kind: 'Referral reward' },
];

export const SEED_REDEMPTIONS: Redemption[] = [
  { id: 'r1', dealTitle: '20% OFF Premium Pizza Deal', businessName: 'Urban Slice', billAmount: 5000, discountPercent: 20, discountAmount: 1000, paidAmount: 4000, savedAmount: 1000, cashbackEarned: 50, pointsEarned: 40, createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), receiptNo: 'BCH-2026-8841' },
  { id: 'r2', dealTitle: '10% Off Weekend Grocery Run', businessName: 'FreshMart Daily', billAmount: 4200, discountPercent: 10, discountAmount: 420, paidAmount: 3780, savedAmount: 420, cashbackEarned: 21, pointsEarned: 17, createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), receiptNo: 'BCH-2026-8719' },
  { id: 'r3', dealTitle: 'Flat 15% Off All Salon Services', businessName: 'Glow & Grace Salon', billAmount: 6500, discountPercent: 15, discountAmount: 975, paidAmount: 5525, savedAmount: 975, cashbackEarned: 49, pointsEarned: 39, createdAt: new Date(Date.now() - 9 * 86400000).toISOString(), receiptNo: 'BCH-2026-8602' },
];

export const SEED_NOTIFICATIONS = [
  { id: 'n1', title: 'Membership activated', body: 'Your Premium membership is active for 12 months. Start saving!', createdAt: new Date(Date.now() - 86400000).toISOString(), read: false, kind: 'membership' },
  { id: 'n2', title: 'Cashback credited', body: 'Rs. 50 cashback credited for your Urban Slice redemption.', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), read: false, kind: 'cashback' },
  { id: 'n3', title: 'New deal near you', body: 'Bean Theory Café: Free dessert Friday is back!', createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), read: true, kind: 'deal' },
];

export const SEED_REVIEWS = [
  { id: 'rv1', author: 'Ayesha K.', rating: 5, text: 'Redeemed the pizza deal in seconds — the QR scan was super smooth and we saved Rs. 1,000!', createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'rv2', author: 'Bilal R.', rating: 4, text: 'Great discount, slight wait at the counter during rush hour but worth it.', createdAt: new Date(Date.now() - 4 * 86400000).toISOString() },
];
