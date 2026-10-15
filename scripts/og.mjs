// Renders the social preview cards from the dev server into public/:
// og.png (the site), og-<product>.png (each product’s page), og-uses.png
// (/uses) and og-experiments.png (/experiments).
//   npm run dev   (in another terminal)
//   node scripts/og.mjs http://localhost:4321

import { join } from "node:path";
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4321";
const cards = {
  "og-card": "og.png",
  "og-fettle": "og-fettle.png",
  "og-idiff": "og-idiff.png",
  "og-uses": "og-uses.png",
  "og-experiments": "og-experiments.png",
};

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
for (const [route, file] of Object.entries(cards)) {
  const out = join(import.meta.dirname, "..", "public", file);
  await page.goto(new URL(`/${route}`, base).href, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".card").screenshot({ path: out });
  console.log(`og: wrote ${out}`);
}
await browser.close();
