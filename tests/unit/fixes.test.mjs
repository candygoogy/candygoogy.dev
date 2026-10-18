import assert from "node:assert/strict";
import test from "node:test";
import { fixes } from "../../src/data/site.ts";
import { checkFixes } from "../../src/lib/fixes.ts";

const fix = (url, merged = "2026-10-07") => ({
  project: "Example",
  url,
  merged,
  line: "A line.",
});

test("checkFixes passes the listed fixes, newest first", () => {
  const checked = checkFixes([...fixes].reverse());
  assert.equal(checked.length, fixes.length);
  for (let i = 1; i < checked.length; i++) {
    assert.ok(checked[i - 1].merged >= checked[i].merged);
  }
});

test("checkFixes stops on anything but a pull request on GitHub", () => {
  for (const url of [
    "https://github.com/pi-hole/pi-hole/issues/6711",
    "https://github.com/pi-hole/pi-hole/pull/6711/files",
    "https://github.com/pi-hole/pi-hole/pull/",
    "http://github.com/pi-hole/pi-hole/pull/6711",
    "https://gitlab.com/pi-hole/pi-hole/pull/6711",
    "https://github.com/pi-hole/pull/6711",
  ]) {
    assert.throws(() => checkFixes([fix(url)]), /isn't a pull request/, url);
  }
});

test("checkFixes stops on a fix in my own repositories", () => {
  for (const url of [
    "https://github.com/candygoogy/candygoogy.dev/pull/1",
    "https://github.com/fettle-page/fettle/pull/2",
    "https://github.com/Fettle-Page/idiff/pull/3",
  ]) {
    assert.throws(() => checkFixes([fix(url)]), /my own repositories/, url);
  }
});

test("checkFixes stops on a merge day that isn't one", () => {
  const url = "https://github.com/pypa/distlib/pull/269";
  for (const merged of ["Oct 2026", "2026-10", "2026-13-40"]) {
    assert.throws(() => checkFixes([fix(url, merged)]), /merged is/, merged);
  }
});
