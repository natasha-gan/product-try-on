# Natasha — Virtual Try-On

Upload a photo of yourself, paste a clothing URL, and instantly see how it looks on you.

## How It Works

1. **Upload a photo** of yourself (or pick one you've already saved)
2. **Paste a product URL** from any clothing website
3. **See the result** — AI generates an image of you wearing that item

Results are saved so you can revisit them anytime.

## Quick Start

```bash
# Install dependencies
pnpm install

# Install Playwright browser (needed for product scraping)
npx playwright install chromium

# Set up the database
npx prisma db push

# Create .env.local (see below)

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Create `.env.local`:

```env
FASHN_API_KEY=your-fashn-api-key
```

Get an API key at [fashn.ai](https://fashn.ai).

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS (custom design, no component library)
- **Database:** SQLite via Prisma
- **Virtual try-on:** [fashn.ai](https://fashn.ai) (tryon-v1.6)
- **Scraping:** Playwright (stealth browser)
- **Image processing:** sharp

## Architecture

```
src/
├── app/
│   ├── page.tsx                # Single-page app (everything lives here)
│   └── api/
│       ├── photos/route.ts     # Photo upload, list, delete
│       └── tryon/route.ts      # Try-on lifecycle (scrape → generate → result)
├── components/
│   ├── PhotoPicker.tsx         # Photo bank with upload
│   ├── TryOnView.tsx           # Result display + loading states
│   └── History.tsx             # Past try-on results grid
└── lib/
    ├── tryon.ts                # fashn.ai API integration
    ├── scraper.ts              # Product page scraper
    └── db.ts                   # Prisma client
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `npx prisma studio` | Database GUI |
| `npx prisma db push` | Push schema changes |
| `npx prisma db push --force-reset` | Reset database |
