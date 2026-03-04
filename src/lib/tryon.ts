import sharp from "sharp";
import fs from "fs";
import path from "path";

// ─── Config ─────────────────────────────────────────────────────────────────

const FASHN_API_KEY = process.env.FASHN_API_KEY;
const FASHN_BASE_URL = "https://api.fashn.ai/v1";
const FASHN_MODEL = "tryon-v1.6";

// Polling config
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_TIME_MS = 120_000; // 2 minutes

export interface TryOnInput {
  userPhotoPath: string;
  clothingImagePath: string | null;
  clothingName: string;
  clothingDetails?: {
    description?: string;
    color?: string;
    material?: string;
    category?: string;
    brand?: string;
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function generateTryOnImage(input: TryOnInput): Promise<Buffer> {
  if (!FASHN_API_KEY || FASHN_API_KEY.startsWith("your-")) {
    throw new Error("FASHN_API_KEY is not configured. Get one at https://fashn.ai");
  }

  if (!input.clothingImagePath) {
    throw new Error("Virtual try-on requires a clothing image. Please scrape a product with an image.");
  }

  // Resolve & preprocess images
  const userPhoto = await resolveImage(input.userPhotoPath);
  if (!userPhoto) throw new Error("Could not load user photo");

  const clothingImg = await resolveImage(input.clothingImagePath);
  if (!clothingImg) throw new Error(`Could not load clothing image from: ${input.clothingImagePath}`);

  console.log(`[fashn] Pre-processing images...`);
  const modelBuffer = await preprocessImage(userPhoto.base64);
  const garmentBuffer = await preprocessImage(clothingImg.base64);
  console.log(`[fashn] Model photo: ${(modelBuffer.length / 1024).toFixed(0)}KB, Garment: ${(garmentBuffer.length / 1024).toFixed(0)}KB`);

  const modelDataUrl = `data:image/jpeg;base64,${modelBuffer.toString("base64")}`;
  const garmentDataUrl = `data:image/jpeg;base64,${garmentBuffer.toString("base64")}`;

  // Detect garment category
  const category = detectCategory(input);
  console.log(`[fashn] Category: ${category}`);

  // Submit the try-on job
  console.log(`[fashn] Submitting job to ${FASHN_MODEL}...`);
  const predictionId = await submitJob(modelDataUrl, garmentDataUrl, category);
  console.log(`[fashn] Job submitted: ${predictionId}`);

  // Poll for completion
  const resultUrl = await pollForResult(predictionId);
  console.log(`[fashn] ✅ Got result URL`);

  // Download the result image
  const resultBuffer = await downloadImage(resultUrl);
  console.log(`[fashn] ✅ Downloaded result: ${(resultBuffer.length / 1024).toFixed(0)}KB`);

  return resultBuffer;
}

// ─── fashn.ai API ───────────────────────────────────────────────────────────

async function submitJob(
  modelImage: string,
  garmentImage: string,
  category: "auto" | "tops" | "bottoms" | "one-pieces"
): Promise<string> {
  const response = await fetch(`${FASHN_BASE_URL}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FASHN_API_KEY}`,
    },
    body: JSON.stringify({
      model_name: FASHN_MODEL,
      inputs: {
        model_image: modelImage,
        garment_image: garmentImage,
        category,
        garment_photo_type: "auto",
        mode: "balanced",
        output_format: "png",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`fashn.ai API error (${response.status}): ${errorText.substring(0, 300)}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`fashn.ai error: ${data.error}`);
  }
  if (!data.id) {
    throw new Error(`fashn.ai: no prediction ID returned: ${JSON.stringify(data).substring(0, 200)}`);
  }

  return data.id;
}

async function pollForResult(predictionId: string): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const response = await fetch(`${FASHN_BASE_URL}/status/${predictionId}`, {
      headers: {
        Authorization: `Bearer ${FASHN_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`fashn.ai status poll failed (${response.status}): ${await response.text()}`);
    }

    const data = await response.json();

    if (data.status === "completed") {
      if (!data.output || data.output.length === 0) {
        throw new Error("fashn.ai completed but returned no output");
      }
      return data.output[0];
    }

    if (data.status === "failed") {
      throw new Error(`fashn.ai generation failed: ${data.error || "unknown error"}`);
    }

    // Still processing — wait and poll again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`fashn.ai timed out after ${MAX_POLL_TIME_MS / 1000}s`);
}

// ─── Image Helpers ──────────────────────────────────────────────────────────

async function resolveImage(imagePath: string): Promise<{ base64: string; mimeType: string } | null> {
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
    try {
      const response = await fetch(imagePath, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      });
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") || "image/jpeg";
      const mimeType = contentType.split(";")[0].trim();
      return { base64: buffer.toString("base64"), mimeType };
    } catch {
      return null;
    }
  }

  const localPath = path.join(process.cwd(), "public", imagePath);
  if (!fs.existsSync(localPath)) return null;
  const buffer = fs.readFileSync(localPath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif",
  };
  return { base64: buffer.toString("base64"), mimeType: mimeMap[ext] || "image/jpeg" };
}

async function preprocessImage(base64: string): Promise<Buffer> {
  const inputBuffer = Buffer.from(base64, "base64");
  return sharp(inputBuffer)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function downloadImage(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1];
    return Buffer.from(b64, "base64");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download result image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// ─── Category Detection ─────────────────────────────────────────────────────

function detectCategory(input: TryOnInput): "auto" | "tops" | "bottoms" | "one-pieces" {
  const name = (input.clothingName || "").toLowerCase();
  const desc = (input.clothingDetails?.description || "").toLowerCase();
  const category = (input.clothingDetails?.category || "").toLowerCase();
  const all = `${name} ${desc} ${category}`;

  if (/dress|gown|romper|jumpsuit|playsuit|overalls|one.?piece|bodysuit/i.test(all)) return "one-pieces";
  if (/pant|trouser|jean|short|skirt|legging|jogger|chino|cargo|bermuda|capri|bottom/i.test(all)) return "bottoms";
  if (/shirt|top|blouse|sweater|hoodie|jacket|coat|blazer|cardigan|polo|tee|t-shirt|vest|tank/i.test(all)) return "tops";
  return "auto";
}
