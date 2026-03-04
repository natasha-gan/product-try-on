import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTryOnImage } from "@/lib/tryon";
import { scrapeClothingUrl } from "@/lib/scraper";
import fs from "fs";
import path from "path";

const DEFAULT_USER_ID = "default-user";

// Create a try-on: scrape the URL, generate the image, return result
export async function POST(request: NextRequest) {
  const { photoId, clothingUrl } = await request.json();

  if (!photoId || !clothingUrl) {
    return NextResponse.json(
      { success: false, error: "Photo and clothing URL are required" },
      { status: 400 }
    );
  }

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) {
    return NextResponse.json(
      { success: false, error: "Photo not found" },
      { status: 404 }
    );
  }

  // Create try-on record immediately so we can return the ID
  const tryOn = await prisma.tryOn.create({
    data: {
      userId: DEFAULT_USER_ID,
      photoId,
      clothingUrl,
      status: "scraping",
    },
    include: { photo: true },
  });

  // Run scrape + generate in the background, stream progress via polling
  processInBackground(tryOn.id, photo.path, clothingUrl);

  return NextResponse.json({ success: true, data: tryOn });
}

async function processInBackground(tryOnId: string, photoPath: string, clothingUrl: string) {
  try {
    // Step 1: Scrape the product page
    console.log(`[tryon:${tryOnId}] Scraping ${clothingUrl}...`);
    const product = await scrapeClothingUrl(clothingUrl);

    // Save the product image locally
    let localImagePath: string | null = null;
    if (product.imageBuffer?.length || product.imageUrl) {
      const filename = `clothing-${Date.now()}.jpg`;
      const dir = path.join(process.cwd(), "public", "uploads", "clothing");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const savePath = path.join(dir, filename);

      if (product.imageBuffer?.length) {
        fs.writeFileSync(savePath, product.imageBuffer);
      } else if (product.imageUrl) {
        const res = await fetch(product.imageUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        });
        if (res.ok) {
          fs.writeFileSync(savePath, Buffer.from(await res.arrayBuffer()));
        }
      }

      if (fs.existsSync(savePath)) {
        localImagePath = `/uploads/clothing/${filename}`;
      }
    }

    // Update try-on with scraped data
    await prisma.tryOn.update({
      where: { id: tryOnId },
      data: {
        clothingName: product.name || "Clothing Item",
        clothingImage: localImagePath || product.imageUrl || null,
        status: "generating",
      },
    });

    if (!localImagePath && !product.imageUrl) {
      throw new Error("Could not get product image from URL");
    }

    // Step 2: Generate try-on image via fashn.ai
    console.log(`[tryon:${tryOnId}] Generating try-on image...`);
    const resultBuffer = await generateTryOnImage({
      userPhotoPath: photoPath,
      clothingImagePath: localImagePath || product.imageUrl || null,
      clothingName: product.name || "Clothing Item",
      clothingDetails: {
        description: product.description,
        color: product.color,
        material: product.material,
        category: product.category,
        brand: product.brand,
      },
    });

    // Save result image
    const resultFilename = `result-${tryOnId}-${Date.now()}.png`;
    const resultDir = path.join(process.cwd(), "public", "uploads", "results");
    if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
    fs.writeFileSync(path.join(resultDir, resultFilename), resultBuffer);

    await prisma.tryOn.update({
      where: { id: tryOnId },
      data: {
        resultImage: `/uploads/results/${resultFilename}`,
        status: "done",
      },
    });

    console.log(`[tryon:${tryOnId}] ✅ Done`);
  } catch (error) {
    console.error(`[tryon:${tryOnId}] Failed:`, error);
    await prisma.tryOn.update({
      where: { id: tryOnId },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

// Get try-ons (all or single by id)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const tryOn = await prisma.tryOn.findUnique({
      where: { id },
      include: { photo: true },
    });
    return NextResponse.json({ success: true, data: tryOn });
  }

  const tryOns = await prisma.tryOn.findMany({
    where: { userId: DEFAULT_USER_ID },
    include: { photo: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: tryOns });
}

// Delete a try-on
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Try-on ID required" },
      { status: 400 }
    );
  }

  const tryOn = await prisma.tryOn.findUnique({ where: { id } });
  if (!tryOn) {
    return NextResponse.json(
      { success: false, error: "Try-on not found" },
      { status: 404 }
    );
  }

  // Clean up files
  for (const imgPath of [tryOn.resultImage, tryOn.clothingImage]) {
    if (imgPath?.startsWith("/uploads/")) {
      const fullPath = path.join(process.cwd(), "public", imgPath);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    }
  }

  await prisma.tryOn.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
