# Project Natasha

Virtual try-on app: upload a photo of yourself, paste a clothing URL, and instantly see how it looks on you. Powered by fashn.ai.

## Tech Stack
- Next.js 16 (App Router) + TypeScript
- Tailwind CSS (custom design — no component library)
- SQLite via Prisma (v6.5.0)
- Virtual try-on: fashn.ai (tryon-v1.6)
- Image processing: sharp (EXIF rotation, resizing)
- Scraping: Playwright (stealth mode) — extracts product name + image from page
- Package manager: pnpm

## Key Commands
- `pnpm dev` - Start dev server (port 3000)
- `pnpm build` - Build for production
- `npx prisma studio` - Open DB GUI
- `npx prisma db push` - Push schema changes
- `npx prisma db push --force-reset` - Reset DB (no prod instance, safe to do)
- If Turbopack crashes: `rm -rf .next` and restart

## Architecture

### File Structure
- `/src/app/page.tsx` - Single-page app (photo picker + URL input + result view + history)
- `/src/app/api/photos/route.ts` - Photo CRUD (upload, list, delete)
- `/src/app/api/tryon/route.ts` - Try-on lifecycle (create → scrape → generate → done)
- `/src/lib/tryon.ts` - fashn.ai integration (submit → poll → download)
- `/src/lib/scraper.ts` - Product page scraper (Playwright stealth — JSON-LD + OG + DOM extraction)
- `/src/lib/db.ts` - Prisma client singleton
- `/src/components/PhotoPicker.tsx` - Horizontal photo bank with upload
- `/src/components/TryOnView.tsx` - Result display (loading → result → error states)
- `/src/components/History.tsx` - Grid of past try-on results
- `/public/uploads/` - photos/, clothing/, results/

### Database Schema (SQLite)
```
User (id, createdAt)
  └── Photo (id, userId, path, label?, createdAt)
  └── TryOn (id, userId, photoId→Photo, clothingUrl, clothingName?, clothingImage?, resultImage?, status, error?, createdAt)
```

Status flow: `pending` → `scraping` → `generating` → `done` | `failed`

### UI Design
- Single-page app — everything on `/`
- Mobile-first, Apple-inspired minimalism
- No component library — all custom with Tailwind
- Smooth transitions: fade-in, slide-up, scale-in animations
- Horizontal scrolling photo picker with camera upload
- Large 3:4 aspect result display
- History grid of past try-ons below the fold
- Long-press to delete photos (mobile-friendly)

## Try-On Flow
1. User selects a photo from their bank (or uploads a new one on the fly — auto-saved to profile)
2. User pastes a clothing product URL
3. Backend creates TryOn record, kicks off background processing:
   a. **Scrape** — Playwright visits the URL, extracts product name + image (JSON-LD / OG / DOM)
   b. **Generate** — Sends user photo + product image to fashn.ai `POST /v1/run`
   c. **Poll** — Polls `GET /v1/status/{id}` every 2s until complete (~5-17s)
   d. **Save** — Downloads result from CDN, saves to disk, updates DB
4. Frontend polls `GET /api/tryon?id=...` every 2s, shows loading state
5. Result appears with smooth scale-in animation

## Virtual Try-On (fashn.ai)
- **Model**: tryon-v1.6 — purpose-built VTON model
- **API**: Async (submit → poll → get result)
- **Resolution**: 864×1296
- **Mode**: balanced (~8s processing)
- **Key feature**: Handles on-model garment photos natively (garment_photo_type: auto)
- **One image per try-on** — fashn.ai is visual-only, doesn't take measurements or size info

### Image Pre-processing
Before sending to fashn.ai, images go through sharp:
1. EXIF rotation (fixes sideways phone photos)
2. Resize to max 1024px (keeps aspect ratio)
3. Convert to JPEG

## Scraper
Lightweight Playwright scraper — just extracts product name + image. No AI calls.

1. Launch browser with stealth (webdriver removal, chrome runtime spoof)
2. Load page, dismiss cookie banners
3. Extract product data from JSON-LD, Open Graph meta tags, or DOM fallback
4. Download product image via browser session (avoids 403s) or element screenshot fallback
5. Fallback: extract product name from URL slug

~200 lines. No Gemini dependency, no size chart clicking, no accordion expansion.

## API Routes

### `GET/POST/DELETE /api/photos`
- `GET` — list all user photos
- `POST` (FormData) — upload a photo, returns Photo record
- `DELETE ?id=xxx` — delete a photo (blocked if used by try-ons)

### `GET/POST/DELETE /api/tryon`
- `POST` `{ photoId, clothingUrl }` — creates TryOn, kicks off background scrape+generate
- `GET` — list all try-ons (with photo relation)
- `GET ?id=xxx` — single try-on (polled by frontend for status updates)
- `DELETE ?id=xxx` — delete try-on + clean up files from disk

## Environment Variables (.env.local)
```
FASHN_API_KEY=...           # fashn.ai API key for virtual try-on
```

## Design Decisions

### Why one image per try-on (no per-size generation)
fashn.ai is a visual VTON model — it takes a person photo + garment photo and composites them. It doesn't understand sizes, measurements, or fit. Generating per-size would produce identical results since the same two images go in every time. This dramatically simplifies the app and reduces cost/latency to a single API call per try-on.

### Future: Hybrid approach for size-aware try-on
If we want to add size-specific guidance on top of the visual try-on, the planned approach is:
1. **fashn.ai** for the base try-on image (one call, visual only) — already done
2. **Text model** (e.g., Gemini Flash) for per-size fit analysis comparing user body measurements vs scraped garment measurements
3. Display the single try-on image alongside text-based fit commentary per size ("Size S: likely tight in chest, sleeves may be short")

This avoids generating multiple images (which would be identical anyway) while still providing sizing guidance.

To implement this:
- Add a `Measurement` model to the schema for user body measurements (height, chest, waist, hips, etc.)
- Add measurement input UI to the profile/photo bank section
- Expand the scraper to extract size charts and garment measurements from product pages (would need Playwright interactions for size guide modals, accordion expansion, per-size button clicking — plus an AI extraction step via Gemini)
- Add a fit analysis API route: user measurements + garment measurements → per-size fit commentary
- Add a size selector + fit commentary panel below the try-on result in the UI

## Conventions
- Single-page app on `/`, no routing needed
- API returns `{ success, data?, error? }`
- Single default user (id: "default-user", no auth)
- All files in `/public/uploads/` subdirectories
- Light mode only
- Mobile-first design, works on desktop too
