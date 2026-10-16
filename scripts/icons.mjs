// Builds the site icons from the avatar, at build time (after
// scripts/avatar.mjs):
//  - public/favicon.ico: 16, 32 and 48px (Windows uses 48 for the taskbar
//    and shortcuts), cropped in on the subject so it still
//    reads at tab size (the crop is in src/data/avatar.ts); lossless PNGs
//    with each row's filter picked for size (about 15% smaller);
//  - public/apple-touch-icon.png: 180px, the whole image (the OS rounds the
//    corners).
// Both are gitignored. The source is the live avatar from GitHub, or the
// committed src/assets/avatar.jpg without one.
//
// By default this script never fails the build: on any error it copies the
// committed fallback set (src/assets/icons/, made from avatar.jpg with
// --snapshot). With DATA_STRICT=1 (the daily CI run) it still copies them,
// then exits with code 1 if there was any warning (a new avatar's crop to
// check counts).
//   node scripts/icons.mjs [--snapshot]

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { avatarCrop } from "../src/data/avatar.ts";

const root = join(import.meta.dirname, "..");
const assets = join(root, "src", "assets");
const pub = join(root, "public");
const fallback = join(assets, "icons");
const snapshot = process.argv.includes("--snapshot");
const out = snapshot ? fallback : pub;
const FILES = ["favicon.ico", "apple-touch-icon.png"];
let warnings = 0;

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The live avatar and its original file's hash, or the committed one. A
// meta that isn't for this JPEG (an avatar.mjs run cut off between its two
// renames, or a meta from before jpegSha256) can't vouch for the original,
// so its hash is dropped and no known crop applies.
async function source() {
  const live = join(assets, "avatar.live.jpg");
  const meta = join(assets, "avatar.live.json");
  if (!snapshot && existsSync(live) && existsSync(meta)) {
    const image = await readFile(live);
    const { sha256, jpegSha256 } = JSON.parse(await readFile(meta, "utf8"));
    if (jpegSha256 === hash(image)) {
      return { image, sha256, name: "the GitHub avatar" };
    }
    warnings++;
    console.warn(
      "icons: WARNING avatar.live.json isn't for avatar.live.jpg: treating the avatar as new",
    );
    return { image, sha256: undefined, name: "the GitHub avatar" };
  }
  const image = await readFile(join(assets, "avatar.jpg"));
  const sha256 = hash(image);
  return { image, sha256, name: "src/assets/avatar.jpg" };
}

// The configured crop for the picture it was set for; the whole (centred
// square) image for any other.
function region(width, height, sha256) {
  const side = Math.min(width, height);
  const known = sha256 === avatarCrop.sha256;
  if (!known) {
    warnings++;
    console.warn(
      "icons: WARNING new avatar: check the favicon crop in src/data/avatar.ts (using the whole image)",
    );
  }
  const size = Math.round(side / (known ? avatarCrop.zoom : 1));
  const cx = known ? avatarCrop.focus.x * width : width / 2;
  const cy = known ? avatarCrop.focus.y * height : height / 2;
  const clamp = (n, max) => Math.min(Math.max(Math.round(n), 0), max);
  return {
    left: clamp(cx - size / 2, width - size),
    top: clamp(cy - size / 2, height - size),
    width: size,
    height: size,
  };
}

// A PNG's bits per pixel, from its header: the bit depth times the
// channels its colour type has (RGB from a photo is 24, RGBA 32).
function bpp(png) {
  const depth = png.readUInt8(24);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[png.readUInt8(25)];
  if (!channels) throw new Error("icons: not a PNG this script understands");
  return depth * channels;
}

// An .ico is a 6-byte header, a 16-byte entry per image, then the images
// (PNG data inside is fine for every browser). Each entry states its
// image's real bit depth, so the header and the data agree.
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(([size, data], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size, e);
    head.writeUInt8(size, e + 1);
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(bpp(data), e + 6); // bits per pixel
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map(([, data]) => data)]);
}

try {
  const { image, sha256, name } = await source();
  const { width, height } = await sharp(image).metadata();
  const crop = region(width, height, sha256);
  const small = await Promise.all(
    [16, 32, 48].map(async (size) => [
      size,
      await sharp(image)
        .extract(crop)
        .resize(size, size, { kernel: "lanczos3" })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer(),
    ]),
  );
  const touch = await sharp(image)
    .resize(180, 180, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toBuffer();

  await mkdir(out, { recursive: true });
  await writeFile(join(out, "favicon.ico"), ico(small));
  await writeFile(join(out, "apple-touch-icon.png"), touch);
  console.log(`icons: favicon.ico and apple-touch-icon.png from ${name}`);
} catch (error) {
  if (snapshot) throw error;
  warnings++;
  console.warn(`icons: WARNING using the committed fallback icons: ${error}`);
  for (const file of FILES) {
    await copyFile(join(fallback, file), join(pub, file));
  }
}

if (process.env.DATA_STRICT === "1" && warnings) {
  console.error("icons: failing because DATA_STRICT=1");
  process.exitCode = 1;
}
