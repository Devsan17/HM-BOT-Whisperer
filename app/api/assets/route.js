import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const assetRoots = {
  screenshot: path.join(process.cwd(), "screenshots"),
  html: path.join(process.cwd(), "html-snapshots"),
};

function getMimeType(filePath, type) {
  if (type === "html") {
    return "text/html; charset=utf-8";
  }

  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "application/octet-stream";
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const file = searchParams.get("file");

  if (!type || !file || !assetRoots[type]) {
    return NextResponse.json({ error: "Invalid asset request" }, { status: 400 });
  }

  const safeFile = path.basename(decodeURIComponent(file));
  const filePath = path.join(assetRoots[type], safeFile);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const data = fs.readFileSync(filePath);

  return new NextResponse(data, {
    headers: {
      "Content-Type": getMimeType(filePath, type),
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
