// Whether a script was run directly (node scripts/x.mjs), not imported by
// a test. Comparing process.argv[1] with import.meta.filename as text can
// miss: Node resolves links in the module's path but not in argv[1] (a
// checkout reached through a symlink or junction), and on Windows the two
// can differ in case (the drive letter). Then the script would do nothing
// and exit 0. This compares real paths, ignoring case on Windows. Built-ins
// only, for check-live.mjs.
//   if (isMain(import.meta.filename)) { ... }
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

/** @param {string} file the module's own path (import.meta.filename)
 * @param {string | undefined} argv1 @param {string} platform */
export function isMain(
  file,
  argv1 = process.argv[1],
  platform = process.platform,
) {
  if (!argv1) return false;
  const [a, b] = [real(argv1), real(file)];
  return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
