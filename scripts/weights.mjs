// The weights the colophon lists, written into the built pages. A page's
// weight is what a visitor downloads for it: the page itself (its styles
// and most of its scripts are inside it), then the scripts the motion
// loader fetches after the first paint, each compressed as Cloudflare
// sends it (Brotli at quality 4, which matches what it serves to within a
// few bytes). Pictures aren't counted. The fonts are counted once for the
// site, as they ship (a .woff2 is compressed already).
//
// A placeholder is a <data value="" data-weight="…"> naming a built page
// ("fettle.html") or "fonts"; its text becomes the weight in KB, rounded
// (in development it keeps its dash). A page with placeholders is measured
// after they're filled in, so the colophon's own number counts its
// numbers: filled and measured again until nothing changes.
//
// Which scripts a page fetches is worked out the way the loader decides
// (src/scripts/loader.ts): the loader's own file, the scroll reveals, the
// selection and the link marker on every page, the hover previews where
// an element is marked data-preview, and scripts/motion/<name>.ts for each
// data-motion="<name>"; each with the files it imports. The files come
// from the build's bundle, not from their names. The build fails if the
// loader imports anything else (this file would need to learn when), if a
// placeholder names a page that doesn't exist or is left unfilled, if no
// fonts are found, or if the numbers don't settle. Runs last in
// scripts/pages.mjs; it writes text only, so the pages' policies (csp.mjs,
// which hashes scripts and styles) still hold. Development is untouched.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { SCRIPT, STYLE } from "./csp.mjs";

const LOADER = "/src/scripts/loader.ts";
const ALWAYS = [
  "/src/scripts/reveal.ts",
  "/src/scripts/selection.ts",
  "/src/scripts/marker.ts",
];
const PREVIEWS = "/src/scripts/previews.ts";
const MOTION = /\/src\/scripts\/motion\/([^/]+)\.ts$/;
// Passes at most before the build gives up on the numbers settling.
const PASSES = 4;

// A placeholder, with whatever else Astro adds to the tag (its scoped
// styles' attribute). An empty value may be written bare.
const DATA = /<data\b([^>]*)>[^<]*<\/data>/g;
const NAME = /\sdata-weight="([^"]*)"/;
const VALUE = /\svalue(?:="[^"]*")?(?=[\s>])/;
const ANY = /\sdata-weight\b/g;
// What the loader looks for, read from the markup with script and style
// text taken out.
const MOTION_ATTR = /\sdata-motion\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const PREVIEW_ATTR = /\sdata-preview(?=[\s=>])/i;
const FONT = /href="\/(_astro\/fonts\/[^"]+\.woff2)"/g;

/** Bytes as Cloudflare sends them. @param {string | Buffer} body */
export const brotli = (body) =>
  brotliCompressSync(body, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
  }).length;

/** @param {number} bytes */
export const kb = (bytes) => Math.round(bytes / 1024);

const markup = (/** @type {string} */ html) =>
  html.replace(SCRIPT, "").replace(STYLE, "");

/** The page with each placeholder's value and text set from `numbers`
 * (KB, by name), and the names it found. Throws on a placeholder it can't
 * fill. @param {string} html @param {Map<string, number>} numbers */
function fill(html, numbers) {
  const names = [];
  const unknown = [];
  const out = html.replace(DATA, (tag, attrs) => {
    const name = NAME.exec(attrs)?.[1];
    if (name === undefined) return tag;
    names.push(name);
    const value = numbers.get(name);
    if (value === undefined || !VALUE.test(attrs)) {
      unknown.push(name);
      return tag;
    }
    return `<data${attrs.replace(VALUE, ` value="${value}"`)}>${value}</data>`;
  });
  const all = markup(html).match(ANY)?.length ?? 0;
  if (unknown.length || names.length !== all) {
    throw new Error(
      `weights: ${all - names.length + unknown.length} of ${all} placeholders can't be filled${unknown.length ? ` (${unknown.join(", ")})` : ""}. Is each a <data value="" data-weight="page.html"> naming a built page, or "fonts"?`,
    );
  }
  return { html: out, names };
}

/** The Vite plugin that reads which file each script ended up in, and the
 * step (given the built site's folder) that writes the weights in. */
export function weights() {
  /** @type {Map<string, { imports: string[], dynamic: string[] }>} */
  const chunks = new Map();
  /** @type {Map<string, string>} the file each script module ended up in */
  const files = new Map();
  /** @type {string | undefined} */
  let loader;
  /** @type {import("vite").Plugin} */
  const plugin = {
    name: "weights:chunks",
    generateBundle(_, bundle) {
      const all = Object.values(bundle).filter((c) => c.type === "chunk");
      const id = (/** @type {string} */ m) =>
        m.replaceAll("\\", "/").split("?")[0] ?? "";
      const has = all.find((c) =>
        c.moduleIds.some((m) => id(m).endsWith(LOADER)),
      );
      // Only the client's bundle carries the loader.
      if (!has) return;
      loader = has.fileName;
      for (const c of all) {
        chunks.set(c.fileName, {
          imports: c.imports,
          dynamic: c.dynamicImports,
        });
        if (c.facadeModuleId) files.set(c.fileName, id(c.facadeModuleId));
      }
    },
  };

  /** Each file with the files it imports, once. @param {string[]} start */
  const withImports = (start) => {
    const seen = new Set();
    const visit = (/** @type {string} */ file) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const next of chunks.get(file)?.imports ?? []) visit(next);
    };
    start.forEach(visit);
    return [...seen];
  };

  /** @param {string} root @returns {import("./pages.mjs").Step} */
  const transform = (root) => (pages, logger) => {
    if (!loader) {
      throw new Error(
        `weights: no built file contains ${LOADER}, so a page's scripts can't be counted.`,
      );
    }
    // When the loader fetches each file it imports.
    const always = [loader];
    let previews;
    /** @type {Map<string, string>} */
    const motion = new Map();
    const strange = [];
    for (const file of chunks.get(loader)?.dynamic ?? []) {
      const source = files.get(file) ?? file;
      const name = MOTION.exec(source)?.[1];
      if (ALWAYS.some((s) => source.endsWith(s))) always.push(file);
      else if (source.endsWith(PREVIEWS)) previews = file;
      else if (name) motion.set(name, file);
      else strange.push(source);
    }
    // Nothing the loader starts may fetch more by itself.
    const started = [...always, ...(previews ? [previews] : [])];
    for (const file of withImports([...started, ...motion.values()])) {
      if (file !== loader && chunks.get(file)?.dynamic.length) {
        strange.push(`what ${file} imports`);
      }
    }
    if (strange.length) {
      throw new Error(
        `weights: the motion loader fetches ${strange.join(", ")}, and scripts/weights.mjs doesn't know when. Teach it, as src/scripts/loader.ts decides.`,
      );
    }

    /** @type {Map<string, number>} */
    const sizes = new Map();
    const size = (/** @type {string} */ file) => {
      if (!sizes.has(file)) {
        sizes.set(file, brotli(readFileSync(join(root, file))));
      }
      return sizes.get(file) ?? 0;
    };
    // The page and the scripts it fetches after the first paint.
    const weigh = (/** @type {string} */ html) => {
      const text = markup(html);
      const start = [...always];
      if (previews && PREVIEW_ATTR.test(text)) start.push(previews);
      for (const [, double, single, bare] of text.matchAll(MOTION_ATTR)) {
        const file = motion.get(double ?? single ?? bare ?? "");
        if (file) start.push(file);
      }
      return withImports(start).reduce(
        (sum, file) => sum + size(file),
        brotli(html),
      );
    };

    const fonts = new Set(
      pages.flatMap(({ html }) => [...html.matchAll(FONT)].map((m) => m[1])),
    );
    if (!fonts.size) {
      throw new Error(
        `weights: no page links a font in /_astro/fonts/. Has the build changed how it writes them?`,
      );
    }
    let fontBytes = 0;
    for (const font of fonts) {
      fontBytes += statSync(join(root, font ?? "")).size;
    }

    // Every page's number as it is, then the pages with placeholders
    // filled and measured again until their numbers stay the same.
    /** @type {Map<string, number>} */
    const numbers = new Map([["fonts", kb(fontBytes)]]);
    const name = (/** @type {string} */ page) => page.replaceAll("\\", "/");
    for (const { page, html } of pages) {
      numbers.set(name(page), kb(weigh(html)));
    }
    const placed = pages.filter(({ html }) => markup(html).match(ANY));
    for (let pass = 1; pass <= PASSES; pass++) {
      const filled = new Map(
        placed.map(({ page, html }) => [page, fill(html, numbers)]),
      );
      let settled = true;
      for (const [page, { html }] of filled) {
        const now = kb(weigh(html));
        if (now !== numbers.get(name(page))) settled = false;
        numbers.set(name(page), now);
      }
      if (!settled) continue;
      for (const [page, { names }] of filled) {
        logger.info(
          `${page}: ${names.map((n) => `${n} ${numbers.get(n)} KB`).join(", ")} (${pass} ${pass === 1 ? "pass" : "passes"})`,
        );
      }
      return pages.map(({ page, html }) => ({
        page,
        html: filled.get(page)?.html ?? html,
      }));
    }
    throw new Error(
      `weights: the numbers on ${placed.map((p) => p.page).join(", ")} didn't settle in ${PASSES} passes.`,
    );
  };
  return { plugin, transform };
}
