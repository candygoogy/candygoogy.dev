// Minifies the scripts written straight into every page (the <script
// is:inline> blocks in Base.astro: the theme before first paint, the
// navigations between pages, the motion loader's start). Astro ships those
// exactly as written, comments and all, and they're downloaded again with
// every page; the sources keep their comments, the built pages don't.
//
// Only plain inline scripts are touched: no attributes at all, so modules
// (already minified by the build), JSON-LD and the inert loader tag are
// left alone. Each is a self-contained function, so names are shortened
// too. The output never uses syntax newer than ES2020 that the source
// didn't (the theme script runs before first paint, on every browser).
//
// Nothing ships unminified by accident. The build fails, before any page
// is written, if a page doesn't carry exactly PER_PAGE plain scripts (one
// that gained an attribute would be skipped), if a script doesn't parse,
// if its output could close its own tag, or if any script written into a
// page still has a comment afterwards. Development is untouched.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { minifySync, parseSync } from "vite";

// The plain inline scripts in Base.astro, on every page. Adding or
// removing one there means changing this too.
const PER_PAGE = 3;
const TARGET = "es2020";

const INLINE = /<script>([\s\S]*?)<\/script>/g;
// Every script in the page with its attributes, to check what's left.
const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

/** @returns {import("astro").AstroIntegration} */
export default function inlineScripts() {
  return {
    name: "inline-scripts",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const pages = (await readdir(root, { recursive: true })).filter((f) =>
          f.endsWith(".html"),
        );
        // Work everything out first, so a failing build leaves no page
        // rewritten. The same script on many pages is minified once.
        /** @type {Map<string, string>} */
        const done = new Map();
        /** @type {string[]} */
        const wrong = [];
        const ready = [];
        let before = 0;
        let after = 0;
        for (const page of pages) {
          const path = join(root, page);
          const html = await readFile(path, "utf8");
          const found = html.match(INLINE)?.length ?? 0;
          if (found !== PER_PAGE) {
            wrong.push(
              `${page} has ${found} plain inline scripts, not ${PER_PAGE}`,
            );
            continue;
          }
          const out = html.replace(INLINE, (_, code) => {
            let min = done.get(code);
            if (min === undefined) {
              const result = minifySync(`${page}.js`, code, {
                compress: { target: TARGET },
                mangle: true,
                module: false,
              });
              if (result.errors.length) {
                throw new Error(
                  `inline scripts: a script on ${page} doesn't parse: ${result.errors.map((e) => e.message).join("; ")}`,
                );
              }
              min = result.code.trim();
              if (!min || /<\/script|<!--/i.test(min)) {
                throw new Error(
                  `inline scripts: a script on ${page} minified to something that can't be inlined.`,
                );
              }
              done.set(code, min);
            }
            before += code.length;
            after += min.length;
            return `<script>${min}</script>`;
          });
          // What the page will ship: every script that runs from the page
          // itself (no src, and plain, classic or module) has no comment
          // left, by the parser's count (a "//" inside a string is fine).
          for (const [, attrs, code] of out.matchAll(SCRIPT)) {
            if (/\bsrc=/.test(attrs)) continue;
            const type = /\btype="([^"]*)"/.exec(attrs)?.[1] ?? "";
            if (!["", "module", "text/javascript"].includes(type)) continue;
            const parsed = parseSync(`${page}.js`, code, {
              sourceType: type === "module" ? "module" : "script",
            });
            if (parsed.errors.length || parsed.comments.length) {
              wrong.push(
                `${page} ships a${type ? ` ${type}` : ""} script ${parsed.errors.length ? "that doesn't parse" : "with comments"}: ${code.trim().slice(0, 60)}…`,
              );
            }
          }
          ready.push([path, out]);
        }
        if (wrong.length || !pages.length) {
          throw new Error(
            `inline scripts: ${wrong.join("; ") || "no pages were built"}.`,
          );
        }
        for (const [path, html] of ready) await writeFile(path, html);
        logger.info(
          `${done.size} inline scripts minified on ${pages.length} pages (${before} → ${after} characters), none with comments left`,
        );
      },
    },
  };
}
