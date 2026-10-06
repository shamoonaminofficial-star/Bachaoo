# Bachatly — Component Architecture (Next.js App Router)

## 1. App Structure

```
/apps
  /web        → public site + customer dashboard (public, account, auth groups)
  /partner    → partner portal (or route group in web; separate app if team scale demands)
  /admin      → super admin panel (dense data UI)
/packages
  /ui         → shared component library (Bachatly design system)
  /database   → Prisma client + schema + migrations + seed
  /types      → shared TypeScript types (API DTOs, enums)
  /validation → shared Zod schemas (forms mirror API DTOs)
  /config     → theme tokens, constants (statuses, badges, currencies)
  /api-client → typed fetch client for /api/v1/ (used by all apps)
```

- Next.js **App Router** everywhere; Server Components by default, Client Components only for interactivity (scanner, maps, charts, forms).
- Route groups: `(public)`, `(auth)`, `(account)`, `(partner)`, `(admin)` each with own layout (see `01-sitemap.md`).

## 2. Design System Tokens (Bachatly)

Theme-configurable (admin can change globally via `SystemSetting`; CSS variables + Tailwind theme):

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#0B6B4F` (deep green) | Primary buttons, active states, brand |
| `--color-primary-dark` | `#095A43` | Hover |
| `--color-ink` | `#101820` | Headings, body text |
| `--color-accent` | `#FFB020` (amber) | Highlights, badges, savings emphasis |
| `--color-success` | `#16A34A` | Active, Paid, Approved |
| `--color-warning` | `#F59E0B` | Pending, expiring soon |
| `--color-error` | `#DC2626` | Failed, Rejected, Expired, Suspended |
| `--color-neutral-*` | Slate scale 50–900 | Backgrounds, borders, muted text |

Rules: **no gradient overuse** (flat color + subtle shadow preferred); rounded cards (`rounded-2xl`), subtle shadows, generous spacing; large headings, clean typography (system stack or Inter-like), strong hierarchy; mobile-first breakpoints; visible focus states; ARIA labels; contrast ≥ 4.5:1.

Status colors always pair color **with text + icon** (never color alone).

## 3. Shared `packages/ui` Library

### Primitives
- `Button` (variants: primary/secondary/ghost/danger; sizes; loading state), `IconButton`
- `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`, `DatePicker`, `PhoneInput` (PK format), `OTPInput`
- `Card`, `Badge` (status + deal badges: EXCLUSIVE / MEMBERS ONLY / TRENDING / NEW / LIMITED TIME / POPULAR), `Avatar`, `Divider`
- `Modal` (with confirmation variant: action summary + affected account + amount + reason field), `Drawer`, `Popover`, `Dropdown`, `Tooltip`
- `Toast` (success/info/warning/error; e.g. "Deal saved successfully.", "Membership activated.")
- `Skeleton` (card, table, list, chart variants), `EmptyState` (icon + message + CTA, e.g. "No deals found in this area." + Explore All Deals), `ErrorState`
- `DataTable` (search, filter, sort, pagination, column visibility, row selection, export, date-range) — admin standard
- `Pagination`, `Tabs`, `Accordion`, `Stepper`, `ProgressBar`
- `BottomSheet` (mobile filters, mobile actions), `StickyMobileNav` (bottom tabs)
- `ShareButtons` (WhatsApp / Facebook / X / Email / Copy link)
- `RatingStars`, `PriceTag` (Rs. formatting), `Countdown` (deal expiry), `DistanceLabel`

### Domain components
- `DealCard` (logo, image, title, discount %, short desc, location, distance, member badge, expiry, favorite toggle, View Deal CTA)
- `BusinessCard` (logo, cover, name, category, rating, location, active-offer count, member discount, View Business CTA)
- `CategoryCard`, `MembershipPlanCard` (price, sale price, benefits, reward multiplier, cashback %, Get Membership CTA)
- `DigitalMembershipCard` (name, membership number, type, join/expiry, status + dynamic QR)
- `QRCard` (auto-refreshing signed token QR, countdown, "don't screenshot" hint)
- `QRScanner` (camera view, scan → validate → bill input → confirm → receipt)
- `VoucherCard` (title, business, value, code, QR, expiry, status)
- `SavingsChart`, `Chart` (line/bar/donut wrappers), `StatCard` (KPI)
- `SearchBar` (autocomplete: deals/businesses/categories + recent searches), `LocationSelector` (country → province → city → area)
- `SavingsCalculator` (spending inputs → estimated monthly/yearly savings, labeled "estimate")
- `ReviewCard` + `ReviewForm`, `NotificationItem`, `TicketThread`, `AuditTimeline`

### Form pattern
React Hook Form + Zod (`packages/validation`); server actions or typed `api-client` calls; inline errors; accessible labels; loading buttons; optimistic UI only where safe (favorites), never for money.

## 4. Rendering Strategy (SSR/SSG)

| Page type | Strategy |
|---|---|
| Homepage, membership, CMS pages | SSG + ISR (revalidate 60–300s) |
| Deal/business/category listings | SSR with search-param caching; ISR for category hubs |
| Deal/business detail | SSG/ISR by slug (fallback blocking), `generateMetadata` per slug |
| Location pages (`/deals/[city]`) | ISR, only for cities with content |
| Dashboards (account/partner/admin) | SSR shell + client data (authenticated, noindex) |
| Search | Client-rendered, debounced, noindex |

Images: `next/image` optimization, lazy loading, blur placeholders; code splitting by route; Redis + CDN caching for hot reads (deal lists, categories, banners).

## 5. Loading / Error States — Skeleton-First Rule

- **Never blank screens**: every async region renders `Skeleton` variants first.
- Loading buttons disable + spinner; tables show table skeletons; charts show chart skeletons.
- `EmptyState` with contextual CTA everywhere a list can be empty.
- Route-level `loading.tsx` / `error.tsx` per segment; global `not-found.tsx` (404), `global-error.tsx` (500); `/maintenance`, `/offline` pages.

## 6. SEO Implementation

- `generateMetadata`: dynamic title/description, canonical URLs, OG + Twitter cards, per-deal/business OG images.
- JSON-LD: `WebSite`+`SearchAction` (home), `ItemList` (listings), `Offer` (deal), `LocalBusiness` (business), `FAQPage` (help).
- `/sitemap.xml` (dynamic; public content only) + `/robots.txt` (disallow account/partner/admin/checkout/api).
- Semantic HTML, single H1, descriptive slugs (`/deal/20-percent-off-pizza`), hreflang-ready for multi-country.

## 7. Accessibility

Keyboard navigation, focus-visible rings, ARIA on modals/drawers/scanner, form labels + error associations, reduced-motion respect, touch targets ≥ 44px, sticky mobile nav with safe-area padding.
