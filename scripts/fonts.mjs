// Downloads the official Fontshare packages and copies the variable WOFF2
// files, byte for byte, into src/fonts/ (gitignored). Astro's fonts API
// (astro.config.mjs) then serves them from our domain under hashed names.
//
// The ITF Free Font License v2.0 allows self-hosting on our own site but
// forbids modifying the files (no subsetting, no format conversion) and
// distributing them through a repository. So the files are never committed;
// every build fetches them fresh. Any failure exits non-zero, which fails the
// build and leaves the previous deployment live.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";

const OUT_DIR = join(import.meta.dirname, "..", "src", "fonts");

// SHA-256 of License/FFL.txt (ITF FFL v2.0, 17 Aug 2026), identical in both
// packages. If Fontshare changes the license text, the build stops until a
// human re-reads it and updates this hash.
const LICENSE_SHA256 =
  "145e7fe2429a3336ba215c070ef722000e01348a3e1baaa127e871bb5012f554";

// SHA-256 of each WOFF2 we serve. The layout is tuned to these exact font
// builds; if Fontshare ships a new one, metrics can shift. Checked on fresh
// downloads and on files already in src/fonts/.
const PACKAGES = [
  {
    slug: "cabinet-grotesk",
    root: "CabinetGrotesk_Complete",
    files: {
      "CabinetGrotesk-Variable.woff2":
        "f71103771c9e32406026b6ea46c7e57cb977d5884e70d0f1beeab91ab2c7abb6",
    },
  },
  {
    slug: "satoshi",
    root: "Satoshi_Complete",
    files: {
      "Satoshi-Variable.woff2":
        "e739aff9b4d02c264341d6d4872edcda28e79373aeda936f659566a1cd3eb47f",
    },
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function download(slug) {
  const url = `https://api.fontshare.com/v2/fonts/download/${slug}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (error) {
      lastError = error;
      console.warn(`fonts: ${slug} attempt ${attempt} failed: ${error}`);
    }
  }
  throw new Error(`fonts: could not download ${slug}: ${lastError}`);
}

function checkFont(file, bytes, expected) {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(
      `fonts: ${file} is not the pinned build (sha256 ${actual}). ` +
        "Re-check the layout with the new file before updating its hash.",
    );
  }
}

const wanted = PACKAGES.flatMap((p) => Object.entries(p.files));
if (
  !process.argv.includes("--force") &&
  wanted.every(([file]) => existsSync(join(OUT_DIR, file)))
) {
  for (const [file, expected] of wanted) {
    checkFont(file, await readFile(join(OUT_DIR, file)), expected);
  }
  console.log("fonts: already present and verified (--force re-downloads)");
  process.exit(0);
}

await mkdir(OUT_DIR, { recursive: true });

for (const pkg of PACKAGES) {
  const entries = unzipSync(await download(pkg.slug));

  const license = entries[`${pkg.root}/License/FFL.txt`];
  if (!license) throw new Error(`fonts: ${pkg.slug} has no License/FFL.txt`);
  if (sha256(license) !== LICENSE_SHA256) {
    throw new Error(
      `fonts: ${pkg.slug} license text changed (sha256 ${sha256(license)}). ` +
        "Re-read it before updating LICENSE_SHA256.",
    );
  }

  for (const [file, expected] of Object.entries(pkg.files)) {
    const bytes = entries[`${pkg.root}/Fonts/WEB/fonts/${file}`];
    if (!bytes) throw new Error(`fonts: ${pkg.slug} is missing ${file}`);
    checkFont(file, bytes, expected);
    await writeFile(join(OUT_DIR, file), bytes);
    console.log(`fonts: ${file} ${bytes.length} B sha256 ${sha256(bytes)}`);
  }
}
