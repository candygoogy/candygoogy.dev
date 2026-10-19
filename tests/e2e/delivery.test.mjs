// The colophon's Delivery row, against the built site. This static server
// doesn't run the Worker, so it adds the Worker's Server-Timing header
// (worker/index.ts) itself.
// Needs `npm run build` first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let server;
let browser;
const headers = {};

before(async () => {
  server = await serve({ headers });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const OPTIONS = { timeout: 60_000 };

async function colophon(timing) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const problems = [];
  headers["/colophon"] = timing ? { "Server-Timing": timing } : {};
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
  await page.goto(new URL("/colophon", server.url).href, { waitUntil: "load" });
  return { context, page, problems };
}

const lines = (page) =>
  page.$$eval("#delivery [data-delivery]", (els) =>
    els.map((el) => [
      el.querySelector("dt").textContent.trim(),
      el.querySelector("dd").textContent,
    ]),
  );

test("without the Worker's header the row stays hidden", OPTIONS, async () => {
  const { context, page, problems } = await colophon(null);
  assert.equal(await page.locator("#delivery").isHidden(), true);
  assert.deepEqual(problems, []);
  await context.close();
});

test(
  "with the header the row shows the city and round trip",
  OPTIONS,
  async () => {
    const { context, page, problems } = await colophon(
      'edge;desc="S%C3%A3o%20Paulo", rtt;dur=12',
    );
    const row = page.locator("#delivery");
    await row.scrollIntoViewIfNeeded();
    assert.equal(await row.isVisible(), true);
    // This static server speaks HTTP/1.1, so that's the protocol.
    assert.deepEqual(await lines(page), [
      ["Served from", "São Paulo"],
      ["Round trip", "12 ms"],
      ["Protocol", "HTTP/1.1"],
    ]);
    assert.deepEqual(problems, []);
    await context.close();
  },
);

// It shows after the page has drawn, so it's the last row: the rows
// above it stay where they were.
test("the row is last, so showing it moves no other row", OPTIONS, async () => {
  const sourceTop = async (timing) => {
    const { context, page } = await colophon(timing);
    const last = await page.$eval(".rows > .row:last-child", (el) => el.id);
    const top = await page
      .locator(".rows > .row:not(#delivery)")
      .last()
      .evaluate((el) => el.getBoundingClientRect().top + scrollY);
    await context.close();
    return { last, top };
  };
  const hidden = await sourceTop(null);
  const shown = await sourceTop('edge;desc="Milan", rtt;dur=12');
  assert.equal(shown.last, "delivery");
  assert.equal(shown.top, hidden.top);
});

test("a missing round trip leaves its line out", OPTIONS, async () => {
  const { context, page } = await colophon('edge;desc="Milan"');
  assert.deepEqual(await lines(page), [
    ["Served from", "Milan"],
    ["Protocol", "HTTP/1.1"],
  ]);
  await context.close();
});

// The browser has no version for a revalidated page; Cloudflare always
// does, so the Worker's wins.
test("the Worker's HTTP version wins over the browser's", OPTIONS, async () => {
  const { context, page } = await colophon(
    'edge;desc="Milan", proto;desc="HTTP/3"',
  );
  assert.deepEqual(await lines(page), [
    ["Served from", "Milan"],
    ["Protocol", "HTTP/3"],
  ]);
  await context.close();
});
