import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FONTS_COMMIT,
  thirdPartyNotices,
} from "../../scripts/third-party-licenses.mjs";

const url = (path) => new URL(`../../${path}`, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8").replace(/\r\n/g, "\n");

test("the notice names both fonts with their copyright and full OFL", () => {
  const text = thirdPartyNotices([]);
  for (const [entry, license] of [
    ["Newsreader 1.003 (OFL-1.1)", "src/fonts/OFL-Newsreader.txt"],
    ["Schibsted Grotesk 1.100 (OFL-1.1)", "src/fonts/OFL-SchibstedGrotesk.txt"],
  ]) {
    assert.ok(text.includes(`\n${entry}\n`), `${entry} has an entry`);
    const ofl = read(license).trim();
    assert.ok(text.includes(ofl), `${license} is there in full`);
  }
  assert.match(
    text,
    /Copyright 2020 The Newsreader Project Authors \(http:\/\/github\.com\/productiontype\/Newsreader\)/,
  );
  assert.match(
    text,
    /Copyright 2023 The Schibsted-Grotesk Project Authors \(https:\/\/github\.com\/schibsted\/schibsted-grotesk\)/,
  );
  assert.ok(text.includes(`google/fonts at commit ${FONTS_COMMIT}`));
});

test("the fonts come after the packages", () => {
  const text = thirdPartyNotices(["\0vite/preload-helper.js"]);
  const vite = text.indexOf("\nvite ");
  assert.ok(vite > 0, "vite has an entry");
  assert.ok(vite < text.indexOf("\nNewsreader "));
  assert.ok(text.indexOf("\nNewsreader ") < text.indexOf("\nSchibsted "));
});

test("the notice's commit is the one scripts/make-fonts.py builds from", () => {
  const commit = /^COMMIT = "([0-9a-f]{40})"/m.exec(
    read("scripts/make-fonts.py"),
  )?.[1];
  assert.equal(FONTS_COMMIT, commit);
});
