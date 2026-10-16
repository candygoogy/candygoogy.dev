// The Content-Security-Policy of every built page, worked out from the page
// as it ships. Runs after every other step that rewrites the pages (it's
// the last step in scripts/pages.mjs), so what it allows is exactly what
// each page carries:
//
//  - each script written into the page (the theme, the navigations, the
//    motion loader's start, Astro's small inlined modules) by its SHA-256;
//  - each <style> block (the page's CSS is inlined) by its SHA-256;
//  - each style="" attribute (the few that are worked out per page, like a
//    product page's subgrid rows; the reveal delays and stagger indexes are
//    data- attributes, motion.css) by its SHA-256, which needs
//    'unsafe-hashes': only those exact values apply, never 'unsafe-inline'.
//
// Everything else comes from this site only: files, fonts, pictures (plus
// the theme switch's inline data: icons), and /api/presence. No plugins,
// no <base>, no forms. The policy goes into a <meta> right after the
// charset, before the first script, so each page carries only its own
// hashes (the 404 page too, whatever address it's served at). What a
// <meta> can't carry, frame-ancestors, is in public/_headers.
//
// The build fails, before any page is rewritten, if a page has no charset
// to put the policy after, if it already has a policy, or if it has
// anything a policy of hashes can't allow: an event handler attribute
// (onclick=…), a javascript: address, or a script of a type it doesn't
// know. Development is untouched.
import { createHash } from "node:crypto";

const CHARSET = '<meta charset="utf-8">';
export const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
export const STYLE = /<style\b[^>]*>([\s\S]*?)<\/style>/g;
// Attributes are read from the markup with script and style text taken
// out, so a "style=" inside a script is never mistaken for one. Names in
// any case and values in either quote, the way the browser reads them.
const STYLE_ATTR = /<[a-z][^>]*?\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const HANDLER = /<[a-z][^>]*?\son[a-z]+\s*=/i;
const JS_URL =
  /\s(?:xlink:)?(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i;
// Scripts the browser runs; data blocks (JSON-LD, the inert loader tag)
// aren't run, so a policy never applies to them.
export const RUNS = new Set(["", "module", "text/javascript"]);
const DATA = new Set(["application/ld+json", "text/motion-loader"]);
// Whole attribute names only: "data-src=" isn't a src, "data-type=" isn't
// a type.
export const SRC = /(?:^|\s)src=/;
export const TYPE = /(?:^|\s)type="([^"]*)"/;
// A script's type as the browser compares it: "Module" is "module".
export const scriptType = (attrs) =>
  (TYPE.exec(attrs)?.[1] ?? "").trim().toLowerCase();

const ENTITIES = { amp: "&", quot: '"', "#39": "'", lt: "<", gt: ">" };
// An attribute's value as the browser sees it (Astro escapes only these).
const decode = (value) =>
  value.replace(/&(amp|quot|#39|lt|gt);/g, (_, e) => ENTITIES[e]);

const hash = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** @param {string} html */
export function policyFor(html) {
  const scripts = new Set();
  const styles = new Set();
  const attrs = new Set();
  let unknown;
  for (const [, tagAttrs, code] of html.matchAll(SCRIPT)) {
    if (SRC.test(tagAttrs)) continue;
    const type = scriptType(tagAttrs);
    if (RUNS.has(type)) scripts.add(hash(code));
    // A type this file doesn't know might run (application/javascript
    // does) without a hash: fail rather than guess.
    else if (!DATA.has(type)) unknown ??= `a script of type "${type}"`;
  }
  for (const [, css] of html.matchAll(STYLE)) styles.add(hash(css));
  const markup = html
    .replace(SCRIPT, "<script></script>")
    .replace(STYLE, "<style></style>");
  for (const [, double, single] of markup.matchAll(STYLE_ATTR)) {
    attrs.add(hash(decode(double ?? single)));
  }
  const problem = HANDLER.test(markup)
    ? "an event handler attribute"
    : JS_URL.test(markup)
      ? "a javascript: address"
      : unknown;
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${[...scripts].join(" ")}`,
    `style-src 'self'${attrs.size ? " 'unsafe-hashes'" : ""} ${[...styles, ...attrs].join(" ")}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]
    .map((d) => `${d.trim()};`)
    // Ends on a ";": security software that adds its own sources to a
    // page's policy (as some antivirus does) then adds a directive of its
    // own instead of corrupting the last one.
    .join(" ");
  return {
    policy,
    problem,
    count: scripts.size + styles.size + attrs.size,
  };
}

/** The step that writes each page's policy into it (the last one run by
 * scripts/pages.mjs).
 * @type {import("./pages.mjs").Step} */
export const csp = (pages, logger) => {
  const wrong = [];
  const ready = [];
  let most = 0;
  for (const { page, html } of pages) {
    if (html.split(CHARSET).length !== 2) {
      wrong.push(`${page} doesn't have exactly one ${CHARSET}`);
      continue;
    }
    if (/http-equiv="content-security-policy"/i.test(html)) {
      wrong.push(`${page} already has a policy`);
      continue;
    }
    const { policy, problem, count } = policyFor(html);
    if (problem) {
      wrong.push(`${page} has ${problem}`);
      continue;
    }
    most = Math.max(most, count);
    const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
    ready.push({ page, html: html.replace(CHARSET, CHARSET + meta) });
  }
  if (wrong.length || !pages.length) {
    throw new Error(`csp: ${wrong.join("; ") || "no pages were built"}.`);
  }
  logger.info(
    `${pages.length} pages carry their own policy (at most ${most} hashes on a page)`,
  );
  return ready;
};
