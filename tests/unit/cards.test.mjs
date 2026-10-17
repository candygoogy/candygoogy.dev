import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import worker from "../../worker/index.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

// A product's terminal card lives in four places: the page: block in
// src/content/projects/<id>.md, CARDS in worker/index.ts, run_worker_first
// in wrangler.jsonc and src/pages/<id>.txt.ts. Only comments tie them
// together, so these tests check each against the others, both ways.

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

// The product card pages; card.txt.ts is the site's own card, served on /.
const txtPages = readdirSync(new URL("src/pages/", ROOT))
  .filter((name) => name.endsWith(".txt.ts") && name !== "card.txt.ts")
  .map((name) => name.slice(0, -".txt.ts".length));

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
    assert.ok(txtPages.includes(id), `src/pages/${id}.txt.ts exists`);
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

test("every card, worker-first page and .txt page belongs to such a product", () => {
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
    if (path === "/") continue;
    assert.ok(
      products.includes(path.slice(1)),
      `run_worker_first ${path} is a product with a page`,
    );
  }
  for (const id of txtPages) {
    assert.ok(
      products.includes(id),
      `src/pages/${id}.txt.ts is for a product with a page`,
    );
  }
});
