// Renders the social preview cards from the dev server into public/:
// og.png (the site), og-<product>.png (each product’s page), og-uses.png
// (/uses) and og-experiments.png (/experiments).
//   npm run dev   (in another terminal)
//   node scripts/og.mjs http://localhost:4321

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { frontmatter, frontmatterKey } from "./github-days.mjs";

const base = process.argv[2] ?? "http://localhost:4321";
// Every product gets a card, the way src/pages/[ogcard].astro makes one
// (a production build fails without it, src/lib/projects.ts).
const projects = join(import.meta.dirname, "..", "src", "content", "projects");
const products = [];
for (const file of (await readdir(projects)).sort()) {
  if (!file.endsWith(".md")) continue;
  const front = frontmatter(await readFile(join(projects, file), "utf8"));
  if (frontmatterKey(front, "kind") === "product") {
    products.push(file.slice(0, -".md".length));
  }
}
const cards = {
  "og-card": "og.png",
  ...Object.fromEntries(products.map((id) => [`og-${id}`, `og-${id}.png`])),
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
