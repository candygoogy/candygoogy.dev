import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// The page background, --bg in tokens.css, is also written as a literal
// where CSS variables can't reach: the theme-color metas, the inline theme
// script in Base.astro and the theme switch's script. Only a comment keeps
// them in step; this does.
const tokens = read("src/styles/tokens.css");

// The --bg set in the first block after the given selector.
function bgIn(selector) {
  const at = tokens.search(selector);
  assert.notEqual(at, -1, `tokens.css has ${selector}`);
  const bg = /--bg:\s*(#[0-9a-f]{3,8})\s*;/i.exec(tokens.slice(at))?.[1];
  assert.ok(bg, `${selector} sets --bg`);
  return bg.toLowerCase();
}

// Light is the default: :root, shared with [data-theme="light"].
const light = bgIn(/:root,\s*\[data-theme="light"\]\s*\{/);
const dark = bgIn(/^\[data-theme="dark"\]\s*\{/m);

test("tokens.css gives Auto-dark the same --bg as Dark", () => {
  assert.equal(bgIn(/:root:not\(\[data-theme\]\)\s*\{/), dark);
});

test("Base.astro's theme-color metas and theme script use the --bg values", () => {
  const base = read("src/layouts/Base.astro");
  const metas = [
    ...base.matchAll(
      /content="(#[0-9a-f]+)"\s+media="\(prefers-color-scheme: (light|dark)\)"/gi,
    ),
  ];
  const meta = (scheme) => metas.find((m) => m[2] === scheme)?.[1];
  assert.equal(meta("light")?.toLowerCase(), light);
  assert.equal(meta("dark")?.toLowerCase(), dark);
  const script =
    /const bg = theme === "light" \? "(#[0-9a-f]+)" : "(#[0-9a-f]+)"/i.exec(
      base,
    );
  assert.ok(script, "Base.astro's theme script picks bg by theme");
  assert.equal(script[1].toLowerCase(), light);
  assert.equal(script[2].toLowerCase(), dark);
});

test("ThemeSwitch.astro's BG uses the --bg values", () => {
  const bg =
    /const BG = \{ light: "(#[0-9a-f]+)", dark: "(#[0-9a-f]+)" \}/i.exec(
      read("src/components/ThemeSwitch.astro"),
    );
  assert.ok(bg, "ThemeSwitch.astro has a BG map");
  assert.equal(bg[1].toLowerCase(), light);
  assert.equal(bg[2].toLowerCase(), dark);
});
