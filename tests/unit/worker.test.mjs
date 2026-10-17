import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, test } from "node:test";
import worker from "../../worker/index.ts";

const ROOT = new URL("../../", import.meta.url);

const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const realFetch = globalThis.fetch;
let pending;
let stored;

const ctx = () => ({ waitUntil: (p) => pending.push(p) });

function assets(routes) {
  const calls = [];
  return {
    calls,
    fetch: async (input) => {
      calls.push(input);
      const url = new URL(input instanceof Request ? input.url : input);
      const route = routes[url.pathname];
      return route ? route() : new Response("not found", { status: 404 });
    },
  };
}

beforeEach(() => {
  pending = [];
  stored = [];
  globalThis.caches = {
    default: {
      match: async () => undefined,
      put: async (key, res) => stored.push([key, res]),
    },
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.caches;
});

test("/ for curl is the plain-text card", async () => {
  const ASSETS = assets({ "/card.txt": () => new Response("the card\n") });
  const res = await worker.fetch(
    new Request("https://candygoogy.dev/", {
      headers: { "User-Agent": "curl/8.0" },
    }),
    { ASSETS },
    ctx(),
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /^text\/plain/);
  assert.equal(res.headers.get("Vary"), "User-Agent");
  assert.equal(
    res.headers.get("Content-Security-Policy"),
    "default-src 'none'; frame-ancestors 'none'",
  );
  assert.equal(await res.text(), "the card\n");
  assert.equal(new URL(ASSETS.calls[0]).pathname, "/card.txt");
});

test("HEAD / for curl is the card's headers with no body", async () => {
  // The card's own body is cancelled, not left open for the runtime.
  let cancelled = false;
  const body = new ReadableStream({
    start: (c) => c.enqueue(new TextEncoder().encode("the card\n")),
    cancel: () => {
      cancelled = true;
    },
  });
  const ASSETS = assets({ "/card.txt": () => new Response(body) });
  const res = await worker.fetch(
    new Request("https://candygoogy.dev/", {
      method: "HEAD",
      headers: { "User-Agent": "curl/8.0" },
    }),
    { ASSETS },
    ctx(),
  );
  assert.equal(res.status, 200);
  assert.equal(res.body, null);
  assert.ok(cancelled);
  assert.match(res.headers.get("Content-Type"), /^text\/plain/);
  assert.equal(res.headers.get("Vary"), "User-Agent");
  assert.equal(
    res.headers.get("Content-Security-Policy"),
    "default-src 'none'; frame-ancestors 'none'",
  );
});

test("/ for curl without a card falls back to the page", async () => {
  const ASSETS = assets({
    "/": () =>
      new Response("<!doctype html><p>hi", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  });
  const request = new Request("https://candygoogy.dev/", {
    headers: { "User-Agent": "curl/8.0" },
  });
  const res = await worker.fetch(request, { ASSETS }, ctx());
  assert.equal(new URL(ASSETS.calls[0]).pathname, "/card.txt");
  assert.equal(ASSETS.calls[1], request);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("Vary"), "User-Agent");
  assert.equal(await res.text(), "<!doctype html><p>hi");
});

test("/ for a browser is the page from the assets, untouched", async () => {
  const ASSETS = assets({
    "/": () =>
      new Response("<!doctype html><p>hi", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"abc"' },
      }),
  });
  const request = new Request("https://candygoogy.dev/", {
    headers: { "User-Agent": BROWSER },
  });
  const res = await worker.fetch(request, { ASSETS }, ctx());
  assert.equal(ASSETS.calls.length, 1);
  assert.equal(ASSETS.calls[0], request);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("ETag"), '"abc"');
  assert.equal(res.headers.get("Vary"), "User-Agent");
  assert.equal(await res.text(), "<!doctype html><p>hi");
});

// The product pages: each terminal gets the product's own card, and a
// browser the page, untouched; both Vary on the User-Agent.
const TERMINALS = ["curl/8.0", "Wget/1.21.4", "HTTPie/3.2.4", "xh/0.24.0"];
for (const product of ["fettle", "idiff"]) {
  test(`/${product} for terminals is its plain-text card`, async () => {
    for (const agent of TERMINALS) {
      const ASSETS = assets({
        [`/${product}.txt`]: () => new Response(`the ${product} card\n`),
      });
      const res = await worker.fetch(
        new Request(`https://candygoogy.dev/${product}`, {
          headers: { "User-Agent": agent },
        }),
        { ASSETS },
        ctx(),
      );
      assert.equal(res.status, 200, agent);
      assert.match(res.headers.get("Content-Type"), /^text\/plain/);
      assert.equal(res.headers.get("Vary"), "User-Agent");
      assert.equal(
        res.headers.get("Content-Security-Policy"),
        "default-src 'none'; frame-ancestors 'none'",
      );
      assert.equal(await res.text(), `the ${product} card\n`);
      assert.equal(new URL(ASSETS.calls[0]).pathname, `/${product}.txt`);
    }
  });

  test(`/${product} for a browser is the page from the assets, untouched`, async () => {
    const ASSETS = assets({
      [`/${product}`]: () =>
        new Response("<!doctype html><p>product", {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ETag: '"p"',
          },
        }),
    });
    const request = new Request(`https://candygoogy.dev/${product}`, {
      headers: { "User-Agent": BROWSER },
    });
    const res = await worker.fetch(request, { ASSETS }, ctx());
    assert.equal(ASSETS.calls.length, 1);
    assert.equal(ASSETS.calls[0], request);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.equal(res.headers.get("ETag"), '"p"');
    assert.equal(res.headers.get("Vary"), "User-Agent");
    assert.equal(await res.text(), "<!doctype html><p>product");
  });
}

test("a page without a card goes to the assets, even for curl", async () => {
  const ASSETS = assets({ "/uses": () => new Response("<!doctype html>") });
  const request = new Request("https://candygoogy.dev/uses", {
    headers: { "User-Agent": "curl/8.0" },
  });
  const res = await worker.fetch(request, { ASSETS }, ctx());
  assert.deepEqual(ASSETS.calls, [request]);
  assert.equal(res.headers.get("Vary"), null);
});

// A page run_worker_first sends to the Worker without a card would cost
// every visit a Worker run for nothing (and a card the list leaves out is
// never served: the assets answer first).
test("every page run_worker_first sends to the Worker has a card", async () => {
  const config = await readFile(new URL("wrangler.jsonc", ROOT), "utf8");
  const list = JSON.parse(
    config.match(/"run_worker_first":\s*(\[[^\]]*\])/)[1],
  );
  const pages = list.filter((p) => !p.startsWith("/api/"));
  assert.ok(pages.includes("/fettle") && pages.includes("/idiff"));
  for (const path of pages) {
    const ASSETS = assets({});
    await worker.fetch(
      new Request(`https://candygoogy.dev${path}`, {
        headers: { "User-Agent": "curl/8.0" },
      }),
      { ASSETS },
      ctx(),
    );
    assert.match(new URL(ASSETS.calls[0]).pathname, /\.txt$/, path);
  }
});

test("/api/presence passes on the status and nothing else", async () => {
  globalThis.fetch = async () =>
    Response.json({
      success: true,
      data: {
        discord_status: "online",
        discord_user: { id: "1", username: "someone", avatar: "x" },
        activities: [{ name: "Code", state: "Editing secret.ts" }],
        spotify: { song: "Song", artist: "Artist" },
        listening_to_spotify: true,
        kv: { note: "private" },
      },
    });
  const res = await worker.fetch(
    new Request("https://candygoogy.dev/api/presence"),
    {},
    ctx(),
  );
  assert.equal(await res.text(), '{"status":"online"}');
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=30");
  await Promise.all(pending);
  assert.equal(stored.length, 1);
});

test("/api/presence when Lanyard fails is a null status, kept 15s", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("network down");
  };
  const res = await worker.fetch(
    new Request("https://candygoogy.dev/api/presence"),
    {},
    ctx(),
  );
  assert.equal(await res.text(), '{"status":null}');
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=15");
  await Promise.all(pending);
  assert.equal(stored.length, 1);
});

test("/api/presence answers from the cache without asking Lanyard", async () => {
  let calls = 0;
  // Counted, not thrown: presence() swallows a failing fetch.
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ data: { discord_status: "online" } });
  };
  globalThis.caches.default.match = async () =>
    new Response('{"status":"idle"}', {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  const res = await worker.fetch(
    new Request("https://candygoogy.dev/api/presence"),
    {},
    ctx(),
  );
  assert.equal(await res.text(), '{"status":"idle"}');
  assert.equal(calls, 0, "Lanyard was called on a cache hit");
  await Promise.all(pending);
  assert.equal(stored.length, 0);
});

test("/api/presence answers only GET and HEAD", async () => {
  globalThis.fetch = async () => assert.fail("Lanyard was called");
  for (const method of ["POST", "PUT", "DELETE"]) {
    const res = await worker.fetch(
      new Request("https://candygoogy.dev/api/presence", { method }),
      {},
      ctx(),
    );
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("Allow"), "GET, HEAD");
  }
});

// The hello is written three times: the card's x-hello (the Worker), the
// pages' x-hello (public/_headers) and the comment atop every page
// (src/layouts/Base.astro). The card's is the one to match. Read from its
// response, as the Worker may export nothing but its handlers.
test("the hello is the same on the card, the pages' headers and their HTML", async () => {
  const ASSETS = assets({ "/card.txt": () => new Response("the card\n") });
  const res = await worker.fetch(
    new Request("https://candygoogy.dev/", {
      headers: { "User-Agent": "curl/8.0" },
    }),
    { ASSETS },
    ctx(),
  );
  const hello = res.headers.get("x-hello");
  assert.match(hello, /github\.com\/candygoogy\/candygoogy\.dev$/);
  const headers = await readFile(new URL("public/_headers", ROOT), "utf8");
  assert.deepEqual(
    headers.match(/^\s*x-hello:.*$/gim).map((l) => l.trim()),
    [`x-hello: ${hello}`],
  );
  const base = await readFile(new URL("src/layouts/Base.astro", ROOT), "utf8");
  assert.deepEqual(base.match(/<!-- Hi\..*?-->/g), [`<!-- ${hello} -->`]);
});

test("scheduled() without DEPLOY_HOOK_URL asks for nothing", async (t) => {
  t.mock.method(console, "warn", () => {});
  globalThis.fetch = async () => assert.fail("the hook was called");
  await worker.scheduled({}, {}, ctx());
});

test("scheduled() asks the deploy hook for a rebuild, once", async (t) => {
  t.mock.method(console, "log", () => {});
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push([String(input), init?.method]);
    return Response.json({ success: true });
  };
  const DEPLOY_HOOK_URL = "https://api.cloudflare.com/hooks/abc";
  await worker.scheduled({}, { DEPLOY_HOOK_URL }, ctx());
  assert.deepEqual(calls, [[DEPLOY_HOOK_URL, "POST"]]);
});

// A rejected run shows as failed in the Worker's Cron Events.
test("scheduled() fails when the deploy hook says no", async () => {
  globalThis.fetch = async () => new Response("not found", { status: 404 });
  await assert.rejects(
    worker.scheduled({}, { DEPLOY_HOOK_URL: "https://hook.test/" }, ctx()),
    /HTTP 404/,
  );
});
