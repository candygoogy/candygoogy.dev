// Renders the social preview cards from the dev server into public/:
// og.png (the site), og-<product>.png (each product’s page), og-uses.png
// (/uses), og-projects.png (/projects) and og-experiments.png
// (/experiments).
//   npm run dev   (in another terminal)
//   node scripts/og.mjs http://localhost:4321
// With --sites <dir> it also renders the sub-sites' cards (each experiment
// and the map) to <dir>/<label>.png, named by the first label of the host.
// Each sub-site serves its own, so <dir> is never public/ or anywhere in
// this repo.
//   node scripts/og.mjs http://localhost:4321 --sites <dir>

import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, isAbsolute } from "node:path";
import { chromium } from "playwright";
import {
  frontmatter,
  frontmatterFlag,
  frontmatterKey,
} from "./github-days.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--sites");
const sitesDir = at === -1 ? undefined : args[at + 1];
if (at !== -1) args.splice(at, 2);
const base = args[0] ?? "http://localhost:4321";
const repo = resolve(import.meta.dirname, "..");
if (at !== -1) {
  const inside = sitesDir && relative(repo, resolve(sitesDir));
  if (!sitesDir || (!inside.startsWith("..") && !isAbsolute(inside))) {
    console.error("og: --sites needs a folder outside this repo");
    process.exit(1);
  }
}
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
  "og-projects": "og-projects.png",
  "og-experiments": "og-experiments.png",
};

// The sub-sites' cards, the way src/pages/[ogcard].astro makes them: every
// experiment that isn't a draft, by its host's first label, and the map.
const sites = {};
if (sitesDir) {
  const dir = join(repo, "src", "content", "experiments");
  const labels = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith(".md")) continue;
    const front = frontmatter(await readFile(join(dir, file), "utf8"));
    if (frontmatterFlag(front, "draft")) continue;
    labels.push(new URL(frontmatterKey(front, "url")).host.split(".")[0]);
  }
  labels.push("map");
  for (const label of labels) {
    sites[`og-site-${label}`] = join(resolve(sitesDir), `${label}.png`);
  }
  await mkdir(resolve(sitesDir), { recursive: true });
}

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
for (const [route, out] of Object.entries(sites)) {
  await page.goto(new URL(`/${route}`, base).href, {
    waitUntil: "networkidle",
  });
  // The name is fitted to one line once the fonts are in.
  await page.locator(".card[data-fitted]").waitFor();
  await page.locator(".card").screenshot({ path: out });
  console.log(`og: wrote ${out}`);
}
await browser.close();
