import { chromium, type Browser, type Page } from "playwright";

export interface ScrapedProduct {
  name: string;
  description: string;
  imageUrl: string;
  brand?: string;
  category?: string;
  color?: string;
  material?: string;
  /** Product image downloaded during browser session (avoids 403s) */
  imageBuffer?: Buffer;
}

export interface ScrapeProgress {
  step: number;
  totalSteps: number;
  label: string;
  detail?: string;
}

export type ProgressCallback = (progress: ScrapeProgress) => void;

// ─── Main Scrape Function ───────────────────────────────────────────────────

export async function scrapeClothingUrl(url: string, onProgress?: ProgressCallback): Promise<ScrapedProduct> {
  console.log(`[scraper] Scraping: ${url}`);
  const report = (step: number, label: string, detail?: string) => {
    onProgress?.({ step, totalSteps: 3, label, detail });
  };

  let browser: Browser | null = null;
  try {
    report(1, "Loading page", "Launching browser…");

    browser = await chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--window-size=1440,900"],
    });

    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      locale: "en-CA",
      javaScriptEnabled: true,
    });

    const page = await context.newPage();

    // Stealth: remove webdriver flag
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // @ts-expect-error chrome runtime spoofing
      window.chrome = { runtime: {} };
    });

    await page.goto(cleanUrl(url), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Dismiss cookie banners
    await dismissOverlays(page);

    report(2, "Extracting product info", "Reading page data…");

    // Extract product data from the page (JSON-LD, Open Graph, DOM)
    const product = await page.evaluate((pageUrl) => {
      const result: {
        name: string;
        description: string;
        imageUrl: string;
        brand?: string;
        category?: string;
        color?: string;
        material?: string;
      } = { name: "", description: "", imageUrl: "" };

      // 1. Try JSON-LD structured data
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        try {
          const data = JSON.parse(script.textContent || "");
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            let obj = null;
            if (item["@type"] === "Product") {
              obj = item;
            } else if (item["@graph"]) {
              obj = item["@graph"].find((g: Record<string, string>) => g["@type"] === "Product") || null;
            }
            if (obj) {
              result.name = result.name || obj.name || "";
              result.description = result.description || (typeof obj.description === "string" ? obj.description.slice(0, 200) : "");
              result.imageUrl = result.imageUrl || (Array.isArray(obj.image) ? obj.image[0] : obj.image) || "";
              result.brand = result.brand || obj.brand?.name || (typeof obj.brand === "string" ? obj.brand : "") || "";
              result.category = result.category || obj.category || "";
              result.color = result.color || obj.color || "";
              result.material = result.material || obj.material || "";
            }
          }
        } catch { /* invalid JSON-LD */ }
      }

      // 2. Fallback: Open Graph / meta tags
      const meta = (name: string) => {
        const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        return el?.getAttribute("content") || "";
      };

      result.name = result.name || meta("og:title") || document.title?.split("|")[0]?.split("-")[0]?.trim() || "";
      result.description = result.description || meta("og:description") || meta("description") || "";
      result.imageUrl = result.imageUrl || meta("og:image") || "";

      // 3. Fallback: find a large product image in the DOM
      if (!result.imageUrl) {
        const imgs = Array.from(document.querySelectorAll("img"));
        for (const img of imgs) {
          const src = img.src || img.getAttribute("data-src") || "";
          if (src && img.naturalWidth > 300 && img.naturalHeight > 300) {
            result.imageUrl = src;
            break;
          }
        }
      }

      // Make relative URLs absolute
      if (result.imageUrl && !result.imageUrl.startsWith("http")) {
        try {
          result.imageUrl = new URL(result.imageUrl, pageUrl).href;
        } catch { /* leave as-is */ }
      }

      return result;
    }, url);

    // Download the product image using the browser's session (avoids 403s)
    report(3, "Downloading image", "Capturing product image…");
    let imageBuffer: Buffer | null = null;

    if (product.imageUrl) {
      try {
        const imgResponse = await context.request.get(product.imageUrl, {
          headers: { Referer: url },
        });
        if (imgResponse.ok()) {
          imageBuffer = await imgResponse.body();
          console.log(`[scraper] Downloaded image via browser session (${(imageBuffer!.length / 1024).toFixed(0)}KB)`);
        }
      } catch {
        console.log("[scraper] Browser-session image download failed");
      }
    }

    // Fallback: screenshot the product image element
    if (!imageBuffer) {
      try {
        const imgEl = page.locator('[class*="product"] img, [class*="hero"] img, [class*="gallery"] img, main img').first();
        if (await imgEl.isVisible({ timeout: 500 })) {
          imageBuffer = await imgEl.screenshot({ type: "png", timeout: 2000 });
          console.log(`[scraper] Captured image via screenshot (${(imageBuffer.length / 1024).toFixed(0)}KB)`);
        }
      } catch {
        console.log("[scraper] Screenshot fallback also failed");
      }
    }

    // Fallback name from URL
    if (!product.name) {
      product.name = extractNameFromUrl(url);
    }

    console.log(`[scraper] ✅ "${product.name}" — image: ${imageBuffer ? `${(imageBuffer.length / 1024).toFixed(0)}KB` : product.imageUrl || "none"}`);

    return {
      ...product,
      imageBuffer: imageBuffer || undefined,
    };
  } catch (error) {
    console.error("[scraper] Failed:", error);
    // Return whatever we can from the URL
    return {
      name: extractNameFromUrl(url),
      description: "",
      imageUrl: "",
    };
  } finally {
    if (browser) await browser.close();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanUrl(url: string): string {
  const parsed = new URL(url);
  const tracking = ["gclid", "gclsrc", "gad_source", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];
  for (const p of tracking) parsed.searchParams.delete(p);
  return parsed.toString();
}

async function dismissOverlays(page: Page): Promise<void> {
  // Batch check cookie/consent buttons
  const hit = await page.evaluate(() => {
    const selectors = [
      'button[id*="cookie"]', 'button[class*="cookie"]',
      '[class*="cookie"] button', '[class*="consent"] button',
      '[id*="cookie-banner"] button',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return sel;
        }
      } catch { /* skip */ }
    }
    return null;
  });

  if (hit) {
    try {
      await page.locator(hit).first().click({ timeout: 1000 });
      await page.waitForTimeout(300);
      return;
    } catch { /* click failed */ }
  }

  // Text-based fallback
  for (const text of ['Accept All', 'Accept', 'Got it', 'I agree']) {
    try {
      const btn = page.locator(`button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 150 })) {
        await btn.click({ timeout: 1000 });
        await page.waitForTimeout(300);
        return;
      }
    } catch { /* not found */ }
  }
}

function extractNameFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const segment = pathname.split("/").filter(Boolean).pop() || "";
  const name = segment
    .replace(/\.html?$/, "")
    .replace(/[-_]/g, " ")
    .replace(/p\d+$/, "")
    .trim();
  return name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Clothing Item";
}
