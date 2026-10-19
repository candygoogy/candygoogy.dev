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

// A draft product has no card (src/pages/[product].txt.ts), so curl gets
// the 404 page a browser gets; the card's own 404 is let go, not left open.
test("a product without a card is its 404 page for curl too", async () => {
  let cancelled = false;
  const missing = new ReadableStream({
    start: (c) => c.enqueue(new TextEncoder().encode("not found")),
    cancel: () => {
      cancelled = true;
    },
  });
  const ASSETS = assets({
    "/idiff.txt": () => new Response(missing, { status: 404 }),
    "/idiff": () =>
      new Response("<!doctype html><p>404", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
  });
  const request = new Request("https://candygoogy.dev/idiff", {
    headers: { "User-Agent": "curl/8.0" },
  });
  const res = await worker.fetch(request, { ASSETS }, ctx());
  assert.ok(cancelled);
  assert.equal(ASSETS.calls[1], request);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(await res.text(), "<!doctype html><p>404");
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

// A page run_worker_first sends to the Worker without a job there would
// cost every visit a Worker run for nothing (and a card the list leaves
// out is never served: the assets answer first). The jobs: a card, or
// the colophon's Delivery numbers.
test("every page run_worker_first sends to the Worker has a job there", async () => {
  const config = await readFile(new URL("wrangler.jsonc", ROOT), "utf8");
  const list = JSON.parse(
    config.match(/"run_worker_first":\s*(\[[^\]]*\])/)[1],
  );
  assert.ok(list.includes("/colophon"));
  const pages = list.filter((p) => !p.startsWith("/api/") && p !== "/colophon");
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

// The colophon's Delivery row reads where the page was served from out of
// the response's Server-Timing header.
const COLOPHON = "<!doctype html><p>colophon";

function visit(cf, init) {
  const request = new Request("https://candygoogy.dev/colophon", init);
  if (cf) Object.defineProperty(request, "cf", { value: cf });
  return request;
}

const colophonAssets = (init) =>
  assets({ "/colophon": () => new Response(COLOPHON, init) });

test("/colophon says which city served it, the round trip and HTTP version", async () => {
  const ASSETS = colophonAssets({ headers: { ETag: '"c"' } });
  const request = visit({
    colo: "MXP",
    clientTcpRtt: 12,
    httpProtocol: "HTTP/2",
  });
  const res = await worker.fetch(request, { ASSETS }, ctx());
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("Server-Timing"),
    'edge;desc="Milan", rtt;dur=12, proto;desc="HTTP/2"',
  );
  // The page itself is the built file, untouched.
  assert.deepEqual(ASSETS.calls, [request]);
  assert.equal(res.headers.get("ETag"), '"c"');
  assert.equal(await res.text(), COLOPHON);
});

test("/colophon over HTTP/3 takes the QUIC round trip", async () => {
  const ASSETS = colophonAssets();
  const res = await worker.fetch(
    visit({ colo: "MXP", clientTcpRtt: 0, clientQuicRtt: 8.6 }),
    { ASSETS },
    ctx(),
  );
  assert.equal(
    res.headers.get("Server-Timing"),
    'edge;desc="Milan", rtt;dur=9',
  );
});

test("/colophon without a round trip names the city alone", async () => {
  const ASSETS = colophonAssets();
  const res = await worker.fetch(visit({ colo: "MXP" }), { ASSETS }, ctx());
  assert.equal(res.headers.get("Server-Timing"), 'edge;desc="Milan"');
});

test("/colophon encodes a city that isn't plain ASCII", async () => {
  const ASSETS = colophonAssets();
  const res = await worker.fetch(visit({ colo: "GRU" }), { ASSETS }, ctx());
  assert.equal(
    res.headers.get("Server-Timing"),
    'edge;desc="S%C3%A3o%20Paulo"',
  );
});

test("/colophon passes on only a well-formed HTTP version", async () => {
  const ASSETS = colophonAssets();
  const res = await worker.fetch(
    visit({ colo: "MXP", httpProtocol: 'HTTP/3", x;desc="y' }),
    { ASSETS },
    ctx(),
  );
  assert.equal(res.headers.get("Server-Timing"), 'edge;desc="Milan"');
});

test("/colophon from a data center the list doesn't know gives its code", async () => {
  const ASSETS = colophonAssets();
  const res = await worker.fetch(visit({ colo: "QQQ" }), { ASSETS }, ctx());
  assert.equal(res.headers.get("Server-Timing"), 'edge;desc="QQQ"');
});

// Should the page ever be revalidated (today's responses carry no ETag or
// Last-Modified, so browsers don't), the 304 carries the header too, so
// the row shows this visit, not the first one.
test("/colophon revalidated is still a 304, with this visit's header", async () => {
  const ASSETS = assets({
    "/colophon": () => new Response(null, { status: 304 }),
  });
  const res = await worker.fetch(
    visit(
      { colo: "FCO", clientTcpRtt: 20 },
      { headers: { "If-None-Match": '"c"' } },
    ),
    { ASSETS },
    ctx(),
  );
  assert.equal(res.status, 304);
  assert.equal(
    res.headers.get("Server-Timing"),
    'edge;desc="Rome", rtt;dur=20',
  );
});

test("/colophon with no Cloudflare data (local) has no header", async () => {
  const ASSETS = colophonAssets();
  const res = await worker.fetch(visit(undefined), { ASSETS }, ctx());
  assert.equal(res.headers.get("Server-Timing"), null);
  assert.equal(await res.text(), COLOPHON);
});

test("/colophon never passes on where the visitor is", async () => {
  const ASSETS = colophonAssets();
  const res = await worker.fetch(
    visit({ colo: "MXP", city: "Lipari", country: "IT", region: "Sicily" }),
    { ASSETS },
    ctx(),
  );
  const all = [...res.headers].join("\n");
  assert.doesNotMatch(all, /Lipari|Sicily|\bIT\b/);
});

test("the data center list is codes and city names", async () => {
  const { COLOS } = await import("../../worker/colos.ts");
  const entries = Object.entries(COLOS);
  assert.ok(entries.length > 200);
  assert.equal(COLOS.MXP, "Milan");
  for (const [code, city] of entries) {
    assert.match(code, /^[A-Z]{3}$/);
    assert.ok(city && !city.includes(",") && !city.includes('"'), code);
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

// The zone's Browser Cache TTL rewrites a cached copy's Cache-Control to 4
// hours; a hit goes out with a miss's, so browsers don't keep it that long.
for (const [body, maxAge] of [
  ['{"status":"online"}', 30],
  ['{"status":null}', 15],
]) {
  test(`/api/presence from the cache keeps ${body} ${maxAge}s, as a miss would`, async () => {
    globalThis.caches.default.match = async () =>
      new Response(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=14400",
        },
      });
    const res = await worker.fetch(
      new Request("https://candygoogy.dev/api/presence"),
      {},
      ctx(),
    );
    assert.equal(await res.text(), body);
    assert.equal(res.headers.get("Cache-Control"), `public, max-age=${maxAge}`);
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  });
}

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

// The hello is written four times: the card's x-hello (the Worker), the
// pages' x-hello (public/_headers), the comment atop every page
// (src/layouts/Base.astro) and the console's (src/scripts/loader.ts). The
// card's is the one to match. Read from its response, as the Worker may
// export nothing but its handlers.
test("the hello is the same on the card, the pages' headers, HTML and console", async () => {
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
  const loader = await readFile(new URL("src/scripts/loader.ts", ROOT), "utf8");
  assert.deepEqual(loader.match(/"Hi\..*?"/g), [`"${hello}"`]);
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
