import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";

const DEFAULT_USER_ID = "default-user";

async function ensureUser() {
  return prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    create: { id: DEFAULT_USER_ID },
    update: {},
  });
}

// List all photos
export async function GET() {
  await ensureUser();
  const photos = await prisma.photo.findMany({
    where: { userId: DEFAULT_USER_ID },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ success: true, data: photos });
}

// Upload a photo
export async function POST(request: NextRequest) {
  await ensureUser();

  const formData = await request.formData();
  const file = formData.get("photo") as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: "No photo provided" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `photo-${Date.now()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads", "photos");

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);

  const photo = await prisma.photo.create({
    data: {
      userId: DEFAULT_USER_ID,
      path: `/uploads/photos/${filename}`,
    },
  });

  return NextResponse.json({ success: true, data: photo });
}

// Delete a photo
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { success: false, error: "Photo ID required" },
      { status: 400 }
    );
  }

  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) {
    return NextResponse.json(
      { success: false, error: "Photo not found" },
      { status: 404 }
    );
  }

  // Check if any try-ons use this photo
  const usedBy = await prisma.tryOn.count({ where: { photoId: id } });
  if (usedBy > 0) {
    return NextResponse.json(
      { success: false, error: "This photo is used by try-ons. Delete those first." },
      { status: 400 }
    );
  }

  // Delete file from disk
  const filePath = path.join(process.cwd(), "public", photo.path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.photo.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
