// Every step that rewrites the built pages, in one pass: each page is read
// once, run through the steps in order, and written once. A step checks
// every page before the next one runs, and nothing is written until all of
// them have passed, so a failing build leaves no page rewritten.
//
// In order: the motion loader's tag made inert (scripts/motion-loader.mjs),
// the inline scripts minified (scripts/inline-scripts.mjs), the unused
// lookup rules taken out (below), then each page's Content-Security-Policy
// (scripts/csp.mjs), last, because it hashes the scripts and styles exactly
// as they ship. Development is untouched.
//
// The lookup rules: motion.css maps data-i, data-w and data-d to custom
// properties with one rule per value (and ProductPage.astro maps its row
// counts, data-rows-3 and data-rows-2, the same way), so every page carries
// all of them inline, though each uses only a few. Here a page keeps only
// the ones for values its own elements carry. Nothing sets these attributes
// after load (a cloned element copies values already on the page), so the
// markup is the whole list. Only whole top-level rules of exactly that
// shape, as the build minifies them, are taken out: never a rule that
// shares its selector or has more in it, and nothing inside @media. The
// build fails if a page has none of them, since every page carries
// motion.css: the build would be writing them in a shape this doesn't know.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { csp, STYLE } from "./csp.mjs";
import { inlineScripts } from "./inline-scripts.mjs";
import { motionLoader } from "./motion-loader.mjs";

/** @typedef {{ page: string, html: string }} Page */
/** @typedef {(pages: Page[], logger: import("astro").AstroIntegrationLogger) => Page[]} Step */

// [data-i="3"]{--i:3}, or scoped, [data-astro-cid-x][data-rows-3="2"]{--rows-3:2}.
const LOOKUP = String.raw`(?:\[data-astro-cid-[a-z0-9]+\])?\[data-(i|w|d|rows-[23])="(\d+)"\]\{--\1:[^;{}]*\}`;
// The lookup rules, and what's needed to tell whether one is at the top
// level: braces, and the strings and comments that could hide one.
const TOKEN = new RegExp(
  String.raw`${LOOKUP}|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|/\*[\s\S]*?\*/|[{}]`,
  "g",
);
// The values the page's elements carry, read from the markup with its CSS
// taken out (a "data-i=" inside a script only keeps a rule).
const USE =
  /\sdata-(i|w|d|rows-[23])\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** The page without the lookup rules for values none of its elements
 * carry, with how many it had and how many went. @param {string} html */
export function pruneLookups(html) {
  const used = new Set();
  for (const [, name, double, single, bare] of html
    .replace(STYLE, "")
    .matchAll(USE)) {
    used.add(`${name.toLowerCase()}=${double ?? single ?? bare}`);
  }
  let found = 0;
  let removed = 0;
  const out = html.replace(STYLE, (block, css) => {
    let depth = 0;
    const pruned = css.replace(TOKEN, (token, name, value, at) => {
      if (token === "{") depth++;
      else if (token === "}") depth--;
      // A whole rule: at the top level, and not the end of a longer
      // selector.
      else if (name && depth === 0 && (at === 0 || css[at - 1] === "}")) {
        found++;
        if (!used.has(`${name}=${value}`)) {
          removed++;
          return "";
        }
      }
      return token;
    });
    return `${block.slice(0, block.indexOf(">") + 1)}${pruned}</style>`;
  });
  return { html: out, found, removed };
}

/** @type {Step} */
const lookups = (pages, logger) => {
  const wrong = [];
  const ready = [];
  let found = 0;
  let removed = 0;
  let saved = 0;
  for (const { page, html } of pages) {
    const out = pruneLookups(html);
    if (!out.found) {
      wrong.push(page);
      continue;
    }
    found += out.found;
    removed += out.removed;
    saved += html.length - out.html.length;
    ready.push({ page, html: out.html });
  }
  if (wrong.length || !pages.length) {
    throw new Error(
      `lookup rules: none found on ${wrong.join(", ") || "(no pages)"}. Has the build changed how it writes them?`,
    );
  }
  logger.info(
    `${removed} of ${found} lookup rules unused and taken out on ${pages.length} pages (${saved} characters)`,
  );
  return ready;
};

/** @returns {import("astro").AstroIntegration} */
export default function pages() {
  const loader = motionLoader();
  /** @type {[string, Step][]} */
  const steps = [
    ["motion-loader", loader.transform],
    ["inline-scripts", inlineScripts],
    ["lookups", lookups],
    ["csp", csp],
  ];
  return {
    name: "pages",
    hooks: {
      "astro:config:setup": ({ command, updateConfig }) => {
        if (command !== "build") return;
        updateConfig({ vite: { plugins: [loader.plugin] } });
      },
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true })).filter((f) =>
          f.endsWith(".html"),
        );
        let all = await Promise.all(
          files.map(async (page) => ({
            page,
            html: await readFile(join(root, page), "utf8"),
          })),
        );
        // Each step logs under its own name, as when each was its own
        // integration.
        for (const [name, step] of steps) all = step(all, logger.fork(name));
        await Promise.all(
          all.map(({ page, html }) => writeFile(join(root, page), html)),
        );
      },
    },
  };
}
