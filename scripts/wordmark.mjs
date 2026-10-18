// Renders the README's wordmark images, .github/assets/wordmark-{light,dark}.png:
// "candygoogy" in ink and ".dev" in the soft colour, set like the header's
// wordmark (Schibsted Grotesk at --fw-heavy and --ls-wordmark) from the
// committed font file, on a transparent background trimmed to the letters
// with a small even margin. The weight, spacing and the light and dark
// --ink and --soft come from src/styles/tokens.css. Run it after a change
// to any of them or to the font:
//
//   npm run wordmark

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const font = await readFile(
  join(root, "src", "fonts", "SchibstedGrotesk.woff2"),
);
const tokens = (
  await readFile(join(root, "src", "styles", "tokens.css"), "utf8")
).replace(/\/\*[\s\S]*?\*\//g, "");

// The transparent margin around the trimmed letters, in pixels.
const MARGIN = 12;

// The declarations of the first rule whose selector is `selector` (any
// whitespace between its parts).
function block(selector) {
  const pattern = selector
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  const match = tokens.match(
    new RegExp(`(?:^|[{}])\\s*${pattern}\\s*\\{([^}]*)\\}`),
  );
  if (!match) throw new Error(`wordmark: no ${selector} block in tokens.css`);
  return match[1];
}

function token(selector, name) {
  const match = block(selector).match(
    new RegExp(`(?:^|[;\\s])${name}\\s*:\\s*([^;]+);`),
  );
  if (!match) throw new Error(`wordmark: no ${name} in ${selector}`);
  return match[1].trim();
}

const weight = token(":root", "--fw-heavy");
const spacing = token(":root", "--ls-wordmark");
const light = ':root, [data-theme="light"]';
const dark = '[data-theme="dark"]';
const themes = {
  light: { ink: token(light, "--ink"), soft: token(light, "--soft") },
  dark: { ink: token(dark, "--ink"), soft: token(dark, "--soft") },
};

const browser = await chromium.launch();
try {
  for (const [name, { ink, soft }] of Object.entries(themes)) {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 400 },
    });
    await page.setContent(`<!doctype html>
<style>
  @font-face {
    font-family: "Schibsted Grotesk";
    src: url(data:font/woff2;base64,${font.toString("base64")}) format("woff2");
    font-weight: 400 800;
  }
  html, body { margin: 0; background: transparent; }
  p {
    display: inline-block;
    margin: 0;
    padding: 40px;
    font: ${weight} 200px / 1.2 "Schibsted Grotesk";
    letter-spacing: ${spacing};
    color: ${ink};
  }
  span { color: ${soft}; }
</style>
<p>candygoogy<span>.dev</span></p>`);
    await page.evaluate(() => document.fonts.ready);
    if (
      !(await page.evaluate(
        (w) => document.fonts.check(`${w} 200px "Schibsted Grotesk"`),
        weight,
      ))
    ) {
      throw new Error("wordmark: Schibsted Grotesk didn't load");
    }
    const shot = await page.locator("p").screenshot({ omitBackground: true });
    const trimmed = await sharp(shot).trim({ threshold: 0 }).toBuffer();
    const out = join(root, ".github", "assets", `wordmark-${name}.png`);
    await sharp(trimmed)
      .extend({
        top: MARGIN,
        bottom: MARGIN,
        left: MARGIN,
        right: MARGIN,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.log(`wordmark: wrote ${out}`);
    await page.close();
  }
} finally {
  await browser.close();
}
