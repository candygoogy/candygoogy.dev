// The scroll reveals (src/scripts/reveal.ts) where a scroll stops: a box
// brings its contents, the band brings its story and facts, a block left
// under its line waits while scrolling and arrives at rest, alone and
// without its group's delay. Against the built site; needs `npm run build`
// first.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let server;
let browser;

before(async () => {
  server = await serve();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

const OPTIONS = { timeout: 60_000 };

// The home page at a size, the intro skipped, once the reveals have set
// up (html.motion-ready). A console error or an uncaught exception fails
// the test once it's done.
async function home(t, width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const problems = [];
  t.after(async () => {
    await context.close();
    assert.deepEqual(problems, [], "the page reported problems");
  });
  // /api/presence is the Worker's, which this static server doesn't run.
  await context.route("**/api/presence", (route) =>
    route.fulfill({ json: { status: null } }),
  );
  await context.addInitScript(() => sessionStorage.setItem("intro-seen", "1"));
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto(server.url);
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("motion-ready"),
  );
  await page.waitForTimeout(600);
  return page;
}

// Scrolls in eight quick steps, like a wheel, until the element's resting
// top (its box less the 40px rise still ahead of a waiting .rv) sits at
// `at` of the window's height.
async function scrollTo(page, selector, at) {
  const y = await page.evaluate(
    ([selector, at]) => {
      const el = document.querySelector(selector);
      const top = el.getBoundingClientRect().top + scrollY;
      const low = el.matches(".rv:not(.is-in)") ? 40 : 0;
      return top - low - innerHeight * at;
    },
    [selector, at],
  );
  const from = await page.evaluate(() => scrollY);
  for (let i = 1; i <= 8; i++) {
    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: "instant" }),
      from + ((y - from) * i) / 8,
    );
    await page.waitForTimeout(40);
  }
}

// Each element's state once its animations (if any) have ended.
const states = (page, selector) =>
  page.evaluate(async (selector) => {
    const els = [...document.querySelectorAll(selector)].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight;
    });
    await Promise.all(
      els.flatMap((el) => el.getAnimations().map((a) => a.finished)),
    );
    return els.map((el) => ({
      in: el.classList.contains("is-in"),
      opacity: getComputedStyle(el).opacity,
    }));
  }, selector);

const shown = (list) => list.map(() => ({ in: true, opacity: "1" }));

test(
  "at rest, the contact card shows all its rows and the email pill",
  OPTIONS,
  async (t) => {
    const page = await home(t, 1366, 600);
    await scrollTo(page, "#contact .card", 0.4);
    await page.waitForTimeout(2500);
    const state = await states(page, "#contact .card li.rv, #contact .mail");
    assert.equal(state.length, 5);
    assert.deepEqual(state, shown(state));
  },
);

test("the band's story and facts arrive with the band", OPTIONS, async (t) => {
  // The band is below the window at load, so it arrives by the scroll.
  const page = await home(t, 1366, 600);
  // One jump into the middle of the band: it crosses its line with its
  // story and facts already in the window.
  await page.evaluate(() => {
    const zig = document.querySelector(".rv-band .zig");
    const y = zig.getBoundingClientRect().top + scrollY - innerHeight * 0.3;
    window.scrollTo({ top: y, behavior: "instant" });
  });
  // Before the rest check (500ms): only the band's own arrival counts.
  await page.waitForTimeout(300);
  const waiting = await page.evaluate(
    () =>
      [...document.querySelectorAll(".rv-band .zig .rv")].filter(
        (el) =>
          el.getBoundingClientRect().top - 40 < innerHeight &&
          !el.classList.contains("is-in"),
      ).length,
  );
  assert.equal(waiting, 0, "a row in the window is still waiting");
  const state = await states(page, ".rv-band .rv");
  assert.ok(state.length > 3);
  assert.deepEqual(state, shown(state));
});

test(
  "a block left under its line waits while scrolling, then arrives at rest without waiting a turn",
  OPTIONS,
  async (t) => {
    const page = await home(t, 1366, 600);
    // The projects list's closing row ("3 more", indexed after the rows
    // above it) at 90%: under its 85% line, while those rows have arrived.
    await scrollTo(page, "#projects .row.end", 0.9);
    await page.waitForTimeout(200);
    const early = await page.evaluate(() => {
      const el = document.querySelector("#projects .row.end");
      const rows = [...document.querySelectorAll("#projects ol > .row")];
      return {
        in: el.classList.contains("is-in"),
        opacity: getComputedStyle(el).opacity,
        above: rows.at(-1).classList.contains("is-in"),
      };
    });
    assert.deepEqual(early, { in: false, opacity: "0", above: true });
    await page.waitForFunction(
      () => document.querySelector("#projects .row.end.is-in"),
      undefined,
      { timeout: 2000 },
    );
    const delay = await page.evaluate(() => {
      const [a] = document.querySelector("#projects .row.end").getAnimations();
      return a?.effect.getTiming().delay;
    });
    assert.equal(delay, 0);
    const state = await states(page, "#projects .row.end");
    assert.deepEqual(state, shown([1]));
  },
);
