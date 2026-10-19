// The data scripts' files (github-data.mjs, experiments-csp.mjs): reading
// the last good data back, and writing it so a build never reads half of it.

import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";

// The first of files that holds a JSON object, or empty without one. A
// corrupt file (or one that isn't an object) falls through to the next one
// with a warning, rather than failing the build.
export async function previous(files, empty, warn) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return data;
      }
      warn(`ignoring ${file}: not an object`);
    } catch (error) {
      warn(`ignoring unreadable ${file}: ${error}`);
    }
  }
  return empty;
}

// Written aside and renamed, so a cut-off write never leaves a broken file
// for the build to read. tidy can reshape the JSON text first.
export async function writeJson(file, data, tidy = (text) => text) {
  await writeFile(`${file}.tmp`, `${tidy(JSON.stringify(data, null, 2))}\n`);
  await rename(`${file}.tmp`, file);
}
