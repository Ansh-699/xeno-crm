// One-off asset pipeline: generates favicon sizes + compresses banner/favicon.
// Run: node scripts/gen-assets.mjs   (from frontend/)
import sharp from "sharp";
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const pub = (p) => resolve(process.cwd(), "public", p);
const app = (p) => resolve(process.cwd(), "src/app", p);

const FAVICON_SRC = pub("xeno-favicon.png");
const BANNER_SRC = pub("banner.png");

// --- Favicon raster sizes ---------------------------------------------------
const sizes = [16, 32, 48, 180, 192, 512];
const pngBySize = {};
for (const size of sizes) {
  pngBySize[size] = await sharp(FAVICON_SRC)
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

// RGBA (non-palette) variants — required for the .ico entries because
// Next.js/Turbopack's ICO decoder rejects palette PNGs ("not in RGBA format").
const rgbaBySize = {};
for (const size of [16, 32, 48]) {
  rgbaBySize[size] = await sharp(FAVICON_SRC)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

// Next.js app-router conventions (auto-linked in <head>)
writeFileSync(app("icon.png"), pngBySize[512]);        // generic
writeFileSync(app("apple-icon.png"), pngBySize[180]);  // apple-touch
// PWA-friendly copies in public/
writeFileSync(pub("favicon-16x16.png"), pngBySize[16]);
writeFileSync(pub("favicon-32x32.png"), pngBySize[32]);
writeFileSync(pub("apple-touch-icon.png"), pngBySize[180]);
writeFileSync(pub("icon-192.png"), pngBySize[192]);
writeFileSync(pub("icon-512.png"), pngBySize[512]);

// --- Build a real multi-size favicon.ico (PNG-encoded entries) --------------
// ICO = 6-byte header + 16-byte dir entry per image + concatenated PNG data.
// Modern browsers accept PNG payloads inside .ico.
function buildIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const datas = [];
  entries.forEach((e, i) => {
    const b = 16 * i;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 0); // width (0 = 256)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 1); // height
    dir.writeUInt8(0, b + 2);  // palette
    dir.writeUInt8(0, b + 3);  // reserved
    dir.writeUInt16LE(1, b + 4);   // color planes
    dir.writeUInt16LE(32, b + 6);  // bits per pixel
    dir.writeUInt32LE(e.data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += e.data.length;
    datas.push(e.data);
  });
  return Buffer.concat([header, dir, ...datas]);
}

const ico = buildIco([
  { size: 16, data: rgbaBySize[16] },
  { size: 32, data: rgbaBySize[32] },
  { size: 48, data: rgbaBySize[48] },
]);
writeFileSync(app("favicon.ico"), ico);
writeFileSync(pub("favicon.ico"), ico);

// --- Compress banner (keep native dimensions, just shrink bytes) ------------
const meta = await sharp(BANNER_SRC).metadata();
const bannerOut = await sharp(BANNER_SRC)
  .png({ compressionLevel: 9, quality: 82, palette: true })
  .toBuffer();
writeFileSync(BANNER_SRC, bannerOut);

// Report
const kb = (b) => (b.length / 1024).toFixed(0) + " KB";
console.log("favicon.ico      ", kb(ico));
console.log("icon.png (512)   ", kb(pngBySize[512]));
console.log("apple-icon (180) ", kb(pngBySize[180]));
console.log(`banner.png       ${meta.width}x${meta.height}  ${(readFileSync(BANNER_SRC).length/1024/1024).toFixed(2)} MB (was 1.70 MB)`);
console.log("Banner native dims:", meta.width + "x" + meta.height);
