import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const url = (path) => new URL(`../../${path}`, import.meta.url);

// The two web fonts are committed subsets (scripts/make-fonts.py), each
// preloaded on every page, so each stays small, and the OFL travels with
// the files it covers.
const fonts = [
  ["src/fonts/Newsreader-Display.woff2", "src/fonts/OFL-Newsreader.txt"],
  ["src/fonts/SchibstedGrotesk.woff2", "src/fonts/OFL-SchibstedGrotesk.txt"],
];

for (const [font, license] of fonts) {
  test(`${font} is committed, at most 46 KB, with its license`, () => {
    assert.ok(existsSync(url(font)), `${font} exists`);
    const bytes = readFileSync(url(font));
    assert.equal(bytes.subarray(0, 4).toString("latin1"), "wOF2", "is WOFF2");
    const size = statSync(url(font)).size;
    assert.ok(size <= 46 * 1024, `${font} is ${size} B`);
    assert.ok(existsSync(url(license)), `${license} exists`);
    assert.match(
      readFileSync(url(license), "utf8"),
      /SIL Open Font License, Version 1\.1/,
    );
  });
}
