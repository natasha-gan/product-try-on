# Architecture Decisions

## 1. LLM-Based Scraping (Gemini 2.5 Flash)

**Date:** 2026-03-05
**Status:** Implemented

### Context
The original scraper used Cheerio with ~500 lines of CSS selectors, regex patterns, and heuristics to extract product data from clothing websites. This approach was brittle — every new site layout could break extraction, and maintaining selector lists for dozens of e-commerce platforms was unsustainable.

### Decision
Replace all Cheerio extraction logic with a single Gemini 2.5 Flash API call. The Playwright browser fetch remains — we still need a real browser to render JavaScript, dismiss cookie banners, and click "Size Guide" links to reveal hidden measurement tables.

### Cost Analysis
- **Gemini 2.5 Flash (text):** ~$0.014/scrape (input: ~50K tokens at $0.15/M, output: ~500 tokens at $0.60/M)
- **Previous approach:** $0 API cost but high maintenance cost per site breakage
- At 100 scrapes/day, monthly cost is ~$42 — acceptable for a prototype

### Trade-offs
- **Pros:** Works across any site without site-specific selectors; extracts structured size/measurement data from varied table formats; self-maintaining as sites update layouts; reduced codebase from ~660 lines to ~210 lines
- **Cons:** Requires API key and network call; adds ~2-5s latency per scrape; non-deterministic output (LLM may occasionally miss data); token cost scales with page complexity
- **Mitigations:** URL-based fallback if Gemini fails or API key is missing; HTML cleaning strips scripts/styles/SVGs to reduce token usage

## 2. Multi-Strategy Scraper with Batch DOM Queries

**Date:** 2026-03-08
**Status:** Implemented

### Context
The initial scraper only loaded the page and clicked one "Size Guide" button. Many sites hide sizing data behind accordions, lazy-loaded content, dynamically injected HTML per size selection, or API responses. The first attempt at adding more strategies used individual `isVisible({ timeout: 500ms })` checks per selector — with 30+ selectors per function, this caused 3+ minute hangs.

### Decision
7-strategy approach with batch DOM queries:
1. Network interception (capture JSON API responses during page load)
2. Dismiss overlays (cookie banners, popups)
3. Scroll for lazy content
4. Expand accordions (details/summary, aria-expanded buttons)
5. Click size guide/chart (30+ selector patterns)
6. Click through each size option (captures dynamic content)
7. Extract JSON-LD structured data

All CSS selector checks use `findFirstVisible()` / `findAllVisible()` — a single `page.evaluate()` that batch-checks all selectors in the browser in one round-trip (~1ms) instead of N individual Playwright `isVisible()` calls (each waiting up to the timeout). Text-based Playwright selectors (`:has-text()`) use 150ms timeouts.

### Trade-offs
- **Pros:** Catches data that the old scraper missed entirely (API responses, per-size dynamic content, accordion-hidden sizing); completes in ~10-20 seconds instead of 3+ minutes
- **Cons:** More complex browser automation code; some strategies are site-dependent

## 3. Image Generation Provider: OOT Diffusion (via Replicate)

**Date:** 2026-03-08
**Status:** Current (testing)

### Context
We tried three approaches for virtual try-on image generation:

**Attempt 1: Gemini 2.5 Flash Image** — General-purpose image generation model. Despite extensive prompt engineering (multi-turn conversations, system instructions, identity-first prompt structure), it consistently generated a completely different person instead of editing the input photo. The clothing was also often changed/hallucinated rather than matching the product image.

**Attempt 2: IDM-VTON (via Replicate)** — Purpose-built virtual try-on model. The clothing application worked well, but two problems: (1) it expects flat-lay garment images, not on-model product photos — when given a photo of a model wearing the garment, it merged the two people; (2) it significantly altered facial features. We added face restoration post-processing (skin-color pixel analysis to detect face region, elliptical gradient mask compositing) but this added complexity without fully solving the issue.

**Attempt 3: OOT Diffusion (via Replicate)** — "Virtual dressing room" model designed to handle on-model garment images natively. Takes `model_image` (person) + `garment_image` (clothing, can be on another model) and transfers the garment.

### Decision
Use OOT Diffusion as primary provider. If face preservation is still insufficient, the plan is to let users mark their face region on their profile photo, then composite the original face onto the result using sharp (pure image processing, no AI call).

### Cost
- **OOT Diffusion:** ~$0.02-0.05/image on Replicate
- **Gemini Image:** ~$0.04/image (but results were unusable)
- **IDM-VTON:** ~$0.02-0.05/image (but couldn't handle on-model garment images)

### Licensing
OOT Diffusion and IDM-VTON are **non-commercial use only**. For production/monetization, would need a commercially licensed alternative (Fashn TRYON, self-hosted model, etc.).

## 4. Image Capture During Browser Session

**Date:** 2026-03-08
**Status:** Implemented

### Context
Many clothing sites (e.g., Aritzia) return 403 Forbidden when product images are downloaded via direct HTTP request without the proper cookies, referrer, and session headers. The scrape API was falling back to storing the raw remote URL, which then failed again during image generation — meaning the AI never saw the clothing image.

### Decision
Capture the product image while the Playwright browser is still open, using the page's cookies and session context. Three-layer strategy:
1. **Browser session fetch** — Use `page.context().request.get(ogImageUrl)` which inherits cookies/referrer (best)
2. **Element screenshot** — Take a screenshot of the product image DOM element as fallback
3. **Direct URL download** — Standard fetch as last resort
4. **Remote URL passthrough** — Store URL and let `resolveImage()` try during generation

### Trade-offs
- **Pros:** Solves 403 issues for sites like Aritzia; image is guaranteed to be available for generation
- **Cons:** Slightly increases scraper complexity; image quality from screenshots may be lower than original

## 5. SSE Streaming for Scraper Progress

**Date:** 2026-03-08
**Status:** Implemented

### Context
The scraper takes 10-20 seconds with all strategies. Users had no visibility into what was happening and thought the app was frozen.

### Decision
Convert the `/api/scrape` endpoint from a standard JSON response to Server-Sent Events (SSE). The scraper accepts a `ProgressCallback` and reports each step. The `ClothingInput` component reads the stream with a `ReadableStream` reader and displays all 9 steps upfront with spinner → checkmark transitions.

### Trade-offs
- **Pros:** Users see real-time progress; can cancel mid-scrape; know exactly how long to wait
- **Cons:** SSE adds complexity vs simple POST/response; requires abort controller management on the client

## 6. Authentication Strategy

**Date:** 2026-03-05
**Status:** Deferred (prototype uses single default user)

### Current Setup
- Single hardcoded user (`id: "default-user"`)
- Prisma + SQLite for all data storage
- No session management, no login flow

### Recommendation
Add auth with NextAuth.js when needed. Consider Supabase migration only if deploying to serverless or needing managed storage. See previous decision doc for full analysis.

## 7. Face Preservation Fallback: User-Defined Face Region

**Date:** 2026-03-08
**Status:** Planned (contingency if OOT Diffusion doesn't preserve face well enough)

### Context
All virtual try-on models we've tested alter the user's face to some degree. IDM-VTON produces better clothing results than OOT Diffusion for flat-lay garment images, but significantly changes facial features. We tried automated face restoration post-processing (skin-color pixel scanning to detect face location, elliptical gradient mask compositing via sharp), but the automated detection was fragile — the assumption that the face is in the "top 18%" breaks for non-standard photo compositions, and skin-color heuristics fail for certain skin tones and lighting.

Using another AI call (e.g., Gemini vision for face bounding box detection) was rejected — the user doesn't want additional AI calls for post-processing.

### Decision (if OOT Diffusion face quality is insufficient)
1. **Switch back to IDM-VTON** for clothing application (it handles garment transfer well)
2. **Let the user mark their face region** on their profile photo — a simple drag-to-draw-rectangle UI on the PhotoUpload component, stored with the Photo record
3. **Composite the original face** onto the IDM-VTON result using sharp:
   - Use the user-defined rectangle (not heuristic detection)
   - Build an elliptical gradient mask around it (soft blend at edges)
   - Overlay original face onto the try-on result
   - Pure image processing, no AI call, ~50-100ms

### Why user-defined > automated
- **Reliable** — the user knows where their face is, no detection failures
- **One-time setup** — mark it once on the profile photo, reuse for all try-ons
- **Zero cost** — no API calls, just sharp compositing
- **Works for any photo** — regardless of composition, lighting, skin tone

### Trade-offs
- **Pros:** Guaranteed face preservation; simple implementation; user is in control
- **Cons:** Extra setup step; user must re-mark if they change their profile photo; hard blend line if the pose between original and result differs significantly (though IDM-VTON preserves pose well)

## 8. Fit Analysis: Estimation Fallback for Missing Measurements

**Date:** 2026-03-08
**Status:** Implemented

### Context
Many product pages don't expose garment measurements — they only list size labels (S, M, L, XL) without any numerical data. Without measurements, the AI had no way to differentiate how different sizes would fit, producing identical-looking images for every size.

### Decision
When garment measurements are missing, estimate fit from the size label:
1. Determine what size the user *should* be based on their chest measurement (M baseline = 98cm)
2. Calculate how many sizes off the requested size is from the user's estimated size
3. Apply ~8% fit difference per size step
4. Generate per-area estimates (chest, waist, hips, shoulders) using ~4cm per size step

This gives the AI a clear "this is 2 sizes too small" or "this is 3 sizes too large" signal even without actual garment measurements.

### Trade-offs
- **Pros:** Every size now generates visually different results; works for any product regardless of data availability
- **Cons:** Estimates may not match actual garment sizing; different brands size differently
