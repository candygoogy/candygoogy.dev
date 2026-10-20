import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import worker from "../../worker/index.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

// A product's terminal card lives in three places: the page: block in
// src/content/projects/<id>.md, CARDS in worker/index.ts and
// run_worker_first in wrangler.jsonc. Only comments tie them together, so
// these tests check each against the others, both ways. The card itself
// comes from src/pages/[product].txt.ts, for every published product.

// The products with a page of their own: a top-level page: key in the
// entry's frontmatter.
const products = readdirSync(new URL("src/content/projects/", ROOT))
  .filter((name) => name.endsWith(".md"))
  .filter((name) => {
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(
      read(`src/content/projects/${name}`),
    )?.[1];
    return /^page:/m.test(front ?? "");
  })
  .map((name) => name.slice(0, -".md".length));

// CARDS isn't exported, so its pairs are read from the source.
const cards = (() => {
  const body = /const CARDS = new Map\(\[([\s\S]*?)\]\);/.exec(
    read("worker/index.ts"),
  )?.[1];
  assert.ok(body, "worker/index.ts has a CARDS map");
  return new Map(
    [...body.matchAll(/\[\s*"([^"]+)",\s*"([^"]+)"\s*\]/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
})();

// The pages in run_worker_first: every entry without a wildcard (/api/*
// is the presence endpoint, not a page).
const firstPages = (() => {
  const list = /"run_worker_first":\s*\[([^\]]*)\]/.exec(
    read("wrangler.jsonc"),
  )?.[1];
  assert.ok(list, "wrangler.jsonc has a run_worker_first list");
  return [...list.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((path) => !path.includes("*"));
})();

// The card pages: card.txt.ts is the site's own card, served on /, and
// [product].txt.ts every product's.
const txtPages = readdirSync(new URL("src/pages/", ROOT)).filter((name) =>
  name.endsWith(".txt.ts"),
);

test("the products with a page are found: fettle and idiff at least", () => {
  // Guards the frontmatter reading: if it found nothing, the tests below
  // would pass without checking anything.
  assert.ok(products.includes("fettle"), "fettle.md has a page: block");
  assert.ok(products.includes("idiff"), "idiff.md has a page: block");
});

test("every product with a page has its card in all three places", async () => {
  for (const id of products) {
    assert.equal(cards.get(`/${id}`), `/${id}.txt`, `CARDS has /${id}`);
    assert.ok(firstPages.includes(`/${id}`), `run_worker_first has /${id}`);
    // And the Worker really answers curl on /<id> with /<id>.txt.
    const calls = [];
    const ASSETS = {
      fetch: async (input) => {
        calls.push(new URL(input instanceof Request ? input.url : input));
        return new Response("card\n");
      },
    };
    const res = await worker.fetch(
      new Request(`https://candygoogy.dev/${id}`, {
        headers: { "User-Agent": "curl/8.0" },
      }),
      { ASSETS },
      { waitUntil: () => {} },
    );
    assert.match(res.headers.get("Content-Type"), /^text\/plain/);
    assert.equal(calls[0]?.pathname, `/${id}.txt`);
  }
});

test("every card and worker-first page belongs to such a product", () => {
  for (const [path, card] of cards) {
    if (path === "/") {
      assert.equal(card, "/card.txt", "/ serves the site's own card");
      continue;
    }
    const id = path.slice(1);
    assert.ok(products.includes(id), `CARDS ${path} is a product with a page`);
    assert.equal(card, `/${id}.txt`, `CARDS ${path} serves /${id}.txt`);
  }
  for (const path of firstPages) {
    // /colophon runs the Worker for its Delivery row, not for a card
    // (tests/unit/worker.test.mjs).
    if (path === "/" || path === "/colophon") continue;
    assert.ok(
      products.includes(path.slice(1)),
      `run_worker_first ${path} is a product with a page`,
    );
  }
});

// A draft product has no page, so it has no card either: curl on it gets
// the 404 page, as a browser does (the Worker falls back when the card
// isn't there). The cards are one route over the same published projects
// the pages are made from, with no card file of a product's own beside it.
test("the product cards are one route over the published products", () => {
  assert.deepEqual(txtPages.toSorted(), ["[product].txt.ts", "card.txt.ts"]);
  const route = read("src/pages/[product].txt.ts");
  assert.match(route, /await orderedProjects\(\)/);
  assert.match(route, /kind === "product"/);
  assert.match(
    read("src/lib/projects.ts"),
    /getCollection\("projects", \(\{ data \}\) => !data\.draft\)/,
  );
});
