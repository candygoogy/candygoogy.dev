// The colophon's Delivery row, against the built site. The Worker writes
// the row into the page as it's sent (worker/delivery.ts), so these tests
// run the real Worker, in workerd (wrangler's unstable_startWorker, from
// wrangler.jsonc), with the request's Cloudflare data (request.cf) given
// in Miniflare's MF-CF-Blob header. The static server stands in for the
// page without the Worker.
// Needs `npm run build` first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { unstable_startWorker } from "wrangler";
import { serve } from "./server.mjs";

let server;
let worker;
let workerUrl;
let browser;

before(async () => {
  server = await serve();
  worker = await unstable_startWorker({
    config: fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url)),
    dev: {
      server: { hostname: "127.0.0.1", port: 0 },
      inspector: false,
      watch: false,
      logLevel: "warn",
    },
  });
  await worker.ready;
  workerUrl = await worker.url;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await worker?.dispose();
  await server?.close();
});

const OPTIONS = { timeout: 60_000 };
const NBSP = String.fromCharCode(0xa0);
const SAO_PAULO = { colo: "GRU", clientTcpRtt: 12.4, httpProtocol: "HTTP/2" };
const cfHeader = (cf) => ({ "MF-CF-Blob": JSON.stringify(cf) });

// The colophon in a fresh context: from the Worker with `cf` as the
// request's Cloudflare data, or from the static server (cf null).
async function colophon(cf, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...(cf && { extraHTTPHeaders: cfHeader(cf) }),
    ...options,
  });
  const problems = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  const base = cf ? workerUrl : server.url;
  await page.goto(new URL("/colophon", base).href, { waitUntil: "load" });
  return { context, page, problems };
}

const lines = (page) =>
  page.$$eval("#delivery [data-delivery]", (els) =>
    els.map((el) => [
      el.querySelector("dt").textContent.trim(),
      el.querySelector("dd").textContent,
    ]),
  );

test("without the Worker the row stays hidden", OPTIONS, async () => {
  const { context, page, problems } = await colophon(null);
  assert.equal(await page.locator("#delivery").isHidden(), true);
  assert.deepEqual(problems, []);
  await context.close();
});

// In the page as sent, so it shows with JavaScript off, in its designed
// place under Weight.
test(
  "the Worker writes the row into the page, after Weight, with no JavaScript",
  OPTIONS,
  async () => {
    const { context, page, problems } = await colophon(SAO_PAULO, {
      javaScriptEnabled: false,
    });
    const row = page.locator("#delivery");
    await row.scrollIntoViewIfNeeded();
    assert.equal(await row.isVisible(), true);
    assert.deepEqual(await lines(page), [
      ["Served from", "São Paulo"],
      ["Round trip", `12${NBSP}ms`],
      ["Protocol", "HTTP/2"],
    ]);
    const rows = await page.$$eval(".rows > .row", (els) =>
      els.map((el) => [
        el.querySelector("dt").textContent.trim(),
        el.dataset.i,
      ]),
    );
    assert.deepEqual(rows, [
      ["Stack", "0"],
      ["Type", "1"],
      ["Data", "2"],
      ["Privacy", "3"],
      ["Motion", "4"],
      ["Weight", "5"],
      ["Delivery", "6"],
      ["Credits", "7"],
      ["Source", "8"],
    ]);
    assert.deepEqual(problems, []);
    await context.close();
  },
);

// The row is there from the first paint, so nothing moves: no layout
// shift at all while the page loads, in a window tall enough to show the
// whole page (a row shown late would move Credits and Source in view).
// Under reduced motion, so the scroll reveal's rise isn't part of it.
test("the row shifts nothing as the page loads", OPTIONS, async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 4000 },
    reducedMotion: "reduce",
    extraHTTPHeaders: cfHeader(SAO_PAULO),
  });
  await context.addInitScript(() => {
    sessionStorage.setItem("intro-seen", "1");
    window.__shifts = [];
    new PerformanceObserver((list) => {
      window.__shifts.push(...list.getEntries().map((e) => e.value));
    }).observe({ type: "layout-shift", buffered: true });
  });
  const page = await context.newPage();
  await page.goto(new URL("/colophon", workerUrl).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
    "the whole page is in view",
  );
  assert.equal(await page.locator("#delivery").isVisible(), true);
  assert.deepEqual(await page.evaluate(() => window.__shifts), []);
  await context.close();
});

test("a missing round trip leaves its line out", OPTIONS, async () => {
  const { context, page } = await colophon(
    { colo: "MXP", httpProtocol: "HTTP/3" },
    { javaScriptEnabled: false },
  );
  assert.deepEqual(await lines(page), [
    ["Served from", "Milan"],
    ["Protocol", "HTTP/3"],
  ]);
  await context.close();
});

// The numbers describe one response, so a browser revalidating its copy
// gets the page whole, with this visit's numbers, never a 304 that would
// keep the old ones; and it has nothing to revalidate against.
test(
  "a conditional request gets this visit's numbers, and no validators",
  OPTIONS,
  async () => {
    const url = new URL("/colophon", workerUrl);
    const res = await fetch(url, {
      headers: {
        ...cfHeader({ colo: "FCO", clientTcpRtt: 20 }),
        "If-None-Match": "*",
        "If-Modified-Since": new Date().toUTCString(),
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("ETag"), null);
    assert.equal(res.headers.get("Last-Modified"), null);
    assert.equal(res.headers.get("Cache-Control"), "private, no-cache");
    // The site's own headers (public/_headers) still come with it.
    assert.match(
      res.headers.get("Content-Security-Policy"),
      /frame-ancestors 'none'/,
    );
    assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
    const html = await res.text();
    assert.match(html, /<div id="delivery"(?![^>]*\shidden)[^>]*>/);
    assert.match(html, />Rome<\/dd>/);
    assert.match(html, new RegExp(`>20${NBSP}ms</dd>`));
    assert.doesNotMatch(html, /data-delivery="protocol"/);
  },
);

test("a HEAD gets the headers alone", OPTIONS, async () => {
  const res = await fetch(new URL("/colophon", workerUrl), {
    method: "HEAD",
    headers: cfHeader(SAO_PAULO),
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});
