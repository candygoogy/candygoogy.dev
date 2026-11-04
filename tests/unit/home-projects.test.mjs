import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  frontmatter,
  frontmatterFlag,
  frontmatterKey,
} from "../../scripts/github-days.mjs";

// The projects as the build wrote them: on the home page, the featured
// products under the band, each with its facts and its page; on
// /projects, every project in its group, the products with facts and the
// rest without. It reads dist/, so it runs after `npm run build`; without
// a build it's skipped.

const DIST = new URL("../../dist/", import.meta.url);
const skip =
  !existsSync(new URL("projects.html", DIST)) &&
  "no dist/: run `npm run build`";
const read = (page) => readFileSync(new URL(page, DIST), "utf8");

const SITE = readFileSync(
  new URL("../../src/data/site.ts", import.meta.url),
  "utf8",
);
const BAND = /featuredProject = "([^"]+)"/.exec(SITE)?.[1];

const DIR = new URL("../../src/content/projects/", import.meta.url);
const PROJECTS = readdirSync(DIR)
  .filter((file) => file.endsWith(".md"))
  .map((file) => {
    const front = frontmatter(readFileSync(new URL(file, DIR), "utf8"));
    // A one-line YAML list ([Rust, Slint]) or a plain or quoted string.
    const text = (key) =>
      new RegExp(`^${key}:[ \\t]*"?(.*?)"?[ \\t]*\\r?$`, "m").exec(front)?.[1];
    return {
      id: file.slice(0, -".md".length),
      kind: frontmatterKey(front, "kind"),
      featured: frontmatterFlag(front, "featured"),
      draft: frontmatterFlag(front, "draft"),
      stack: /^\[(.*)\]$/
        .exec(text("stack") ?? "")?.[1]
        .split(",")
        .map((s) => s.trim()),
      runsOn: text("runsOn"),
    };
  })
  .filter((p) => !p.draft);

// The markup of one element, from its opening tag to its matching close
// (same-name tags nested inside are counted).
function element(html, id) {
  const open = new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>`).exec(html);
  assert.ok(open, `#${id} is on the page`);
  const tag = open[1];
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m; (m = re.exec(html));) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(open.index, m.index + m[0].length);
  }
  assert.fail(`#${id} never closes`);
}

// Text without tags, entities for the few the build writes.
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// A fact list's labels and values, in order.
const facts = (html) =>
  [
    ...html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g),
  ].map(([, dt, dd]) => [plain(dt), plain(dd)]);

const ids = (html, cls) =>
  [
    ...html.matchAll(
      new RegExp(`<li id="([^"]+)" class="[^"]*\\b${cls}\\b`, "g"),
    ),
  ].map((m) => m[1]);

test(
  "home: the featured products under the band, each with its facts and page, then the rest in one row",
  { skip },
  () => {
    const section = element(read("index.html"), "projects");
    const shown = PROJECTS.filter((p) => p.featured && p.id !== BAND);
    assert.deepEqual(
      ids(section, "entry").sort(),
      shown
        .filter((p) => p.kind === "product")
        .map((p) => p.id)
        .sort(),
    );
    for (const p of shown.filter((p) => p.kind === "product")) {
      const entry = element(section, p.id);
      const list = facts(entry);
      assert.deepEqual(
        list.map(([label]) => label),
        ["Status", "Built with", ...(p.runsOn ? ["Runs on"] : [])],
        `${p.id}'s facts`,
      );
      assert.match(list[0][1], /^(Live|In progress|Archived)(, version \S+)?$/);
      // The stack joined with commas, never dots.
      assert.equal(list[1][1], p.stack.join(", "), `${p.id}'s stack`);
      if (p.runsOn) assert.equal(list[2][1], p.runsOn, `${p.id} runs on`);
      assert.match(entry, new RegExp(`<a class="go" href="/${p.id}"`));
    }
    assert.equal(section.includes("·"), false, "no middle dots");
    // The closing row: how many are left out, linking to them all.
    const hidden = PROJECTS.filter((p) => !p.featured && p.id !== BAND);
    const closing = /<div class="row end closing[\s\S]*?<\/div>\s*<\/div>/.exec(
      section,
    );
    assert.ok(closing, "the list closes on one row");
    const count = /class="kind"[^>]*>([\s\S]*?)<\/p>/.exec(closing[0]);
    assert.equal(plain(count?.[1] ?? ""), `${hidden.length} more`);
    assert.match(closing[0], /href="\/projects"/);
  },
);

test(
  "/projects: each group keeps its id and heading; products are entries, the rest ledger items",
  { skip },
  () => {
    const html = read("projects.html");
    const groups = {
      products: ["Products", "product"],
      "side-projects": ["Side projects", "side"],
      websites: ["Websites", "website"],
    };
    const listed = [];
    for (const [id, [title, kind]] of Object.entries(groups)) {
      const group = element(html, id);
      assert.equal(plain(element(group, `${id}-title`)), title);
      const want = PROJECTS.filter((p) => p.kind === kind).map((p) => p.id);
      const got = kind === "product" ? ids(group, "entry") : ids(group, "item");
      assert.deepEqual(got.sort(), want.sort(), `#${id}'s projects`);
      assert.equal(
        /<dl /.test(group),
        kind === "product",
        `facts only in products (#${id})`,
      );
      assert.equal(group.includes("·"), false, `no middle dots in #${id}`);
      listed.push(...got);
    }
    assert.deepEqual(
      listed.sort(),
      PROJECTS.map((p) => p.id).sort(),
      "every project, once",
    );
    assert.match(html, /<h1 id="projects-title"/);
  },
);
