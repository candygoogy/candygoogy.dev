// Fetches candygoogy's avatar from the GitHub profile at build time, so the
// contact card and the site icon follow it (the daily rebuild picks up a
// change within a day). Public, no token.
//
// The image is checked (decodes, at least 64px, at most 2 MB), re-encoded
// without metadata, and written to the gitignored src/assets/avatar.live.jpg,
// with the original file's SHA-256 beside it (avatar.live.json) for the icon
// crop (src/data/avatar.ts). The meta also has the SHA-256 of the JPEG it
// goes with, so scripts/icons.mjs can tell when the two don't match.
//
// By default this script never fails the build. On any error it keeps the
// last good live file, or, without one, copies the committed
// src/assets/avatar.jpg there (with its meta), so the live file always
// exists for the site to import and the committed one never ships beside
// it. With DATA_STRICT=1 (the daily CI run) it exits with code 1 after a
// warning.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const SOURCE = "https://github.com/candygoogy.png?size=460";
const ASSETS = join(import.meta.dirname, "..", "src", "assets");
const LIVE = join(ASSETS, "avatar.live.jpg");
const LIVE_META = join(ASSETS, "avatar.live.json");
const COMMITTED = join(ASSETS, "avatar.jpg");
const MAX_BYTES = 2 * 1024 * 1024;

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Written aside and renamed, so a cut-off write never leaves a broken
// image for the build to import. The two renames aren't one step: if only
// the first lands, jpegSha256 shows icons.mjs the old meta.
async function writeLive(jpeg, meta) {
  await writeFile(`${LIVE}.tmp`, jpeg);
  await writeFile(`${LIVE_META}.tmp`, JSON.stringify(meta) + "\n");
  await rename(`${LIVE}.tmp`, LIVE);
  await rename(`${LIVE_META}.tmp`, LIVE_META);
}

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

  await writeLive(data, { sha256: hash(bytes), jpegSha256: hash(data) });
  console.log(`avatar: ${info.width}×${info.height} from GitHub`);
} catch (error) {
  console.warn(
    `avatar: WARNING kept the last good avatar (or the committed one): ${error}`,
  );
  // The committed file is GitHub's original, unchanged, so both hashes are
  // its own (and the icon crop in src/data/avatar.ts applies).
  if (!existsSync(LIVE)) {
    const committed = await readFile(COMMITTED);
    const sha256 = hash(committed);
    await writeLive(committed, { sha256, jpegSha256: sha256 });
    console.log("avatar: copied the committed avatar.jpg to avatar.live.jpg");
  }
  if (process.env.DATA_STRICT === "1") {
    console.error("avatar: failing because DATA_STRICT=1");
    process.exitCode = 1;
  }
}
