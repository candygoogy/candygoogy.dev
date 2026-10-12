// Fetches candygoogy's avatar from the GitHub profile at build time, so the
// contact card and the site icon follow it (the daily rebuild picks up a
// change within a day). Public, no token.
//
// The image is checked (decodes, at least 64px, at most 2 MB), re-encoded
// without metadata, and written to the gitignored src/assets/avatar.live.jpg,
// with the original file's SHA-256 beside it (avatar.live.json) for the icon
// crop (src/data/avatar.ts).
//
// This script never fails the build. On any error it keeps the last good
// live file, or, without one, the site uses the committed
// src/assets/avatar.jpg.

import { createHash } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const SOURCE = "https://github.com/candygoogy.png?size=460";
const ASSETS = join(import.meta.dirname, "..", "src", "assets");
const LIVE = join(ASSETS, "avatar.live.jpg");
const LIVE_META = join(ASSETS, "avatar.live.json");
const MAX_BYTES = 2 * 1024 * 1024;

try {
  const res = await fetch(SOURCE, {
    headers: { "User-Agent": "candygoogy.dev-build" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`not an image (${type})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`${bytes.length} bytes`);

  // Decoding the whole image (not just its header) catches a broken file.
  const { data, info } = await sharp(bytes)
    .rotate()
    .jpeg({ quality: 95, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  if (Math.min(info.width, info.height) < 64) {
    throw new Error(`only ${info.width}×${info.height}`);
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  // Written aside and renamed, so a cut-off write never leaves a broken
  // image for the build to import.
  await writeFile(`${LIVE}.tmp`, data);
  await writeFile(`${LIVE_META}.tmp`, JSON.stringify({ sha256 }) + "\n");
  await rename(`${LIVE}.tmp`, LIVE);
  await rename(`${LIVE_META}.tmp`, LIVE_META);
  console.log(`avatar: ${info.width}×${info.height} from GitHub`);
} catch (error) {
  console.warn(
    `avatar: WARNING kept the last good avatar (or the committed one): ${error}`,
  );
}
