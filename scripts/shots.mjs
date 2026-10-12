// Full-page screenshots of each page in every theme at
// 1440 and 390 px, plus an axe-core scan of each. Output goes to the
// gitignored .shots/ folder. Pages are captured with reduced motion, so the
// screenshots show the finished state of every animation.
//
//   node scripts/shots.mjs <base-url> <path> [<path> ...]
//   e.g. node scripts/shots.mjs http://localhost:4321 / /fettle /tokens

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

const [base, ...paths] = process.argv.slice(2);
if (!base || paths.length === 0) {
  console.error("usage: node scripts/shots.mjs <base-url> <path> [...]");
  process.exit(2);
}

const OUT = join(import.meta.dirname, "..", ".shots");
const THEMES = ["light", "dark"];
const WIDTHS = [1440, 390];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
let violations = 0;

for (const path of paths) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: theme === "light" ? "light" : "dark",
        reducedMotion: "reduce",
      });
      await context.addInitScript((t) => {
        localStorage.setItem("theme", t);
      }, theme);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

      await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);

      const name = `${path.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}-${theme}-${width}`;
      await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

      const scrollX = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      violations += axe.violations.length;

      console.log(
        `${name}: axe ${axe.violations.length} violations` +
          (axe.violations.length
            ? ` (${axe.violations.map((v) => v.id).join(", ")})`
            : "") +
          `, horizontal overflow ${scrollX ? "YES" : "no"}` +
          `, console errors ${errors.length}`,
      );
      await context.close();
    }
  }
}

await browser.close();
process.exit(violations ? 1 : 0);
