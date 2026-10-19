// The scripts' "run directly" guard (scripts/is-main.mjs).
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isMain } from "../../scripts/is-main.mjs";

test("isMain: the same file through a link or in other case, not another", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "is-main-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const real = join(dir, "real");
  mkdirSync(real);
  const file = join(real, "x.mjs");
  writeFileSync(file, "");
  writeFileSync(join(real, "y.mjs"), "");
  // A junction on Windows needs no extra rights; elsewhere a plain link.
  symlinkSync(real, join(dir, "link"), "junction");

  assert.equal(isMain(file, join(dir, "link", "x.mjs")), true);
  assert.equal(isMain(file, file.toUpperCase(), "win32"), true);
  assert.equal(isMain(file, join(dir, "link", "y.mjs")), false);
  assert.equal(isMain(file, undefined), false);
});
