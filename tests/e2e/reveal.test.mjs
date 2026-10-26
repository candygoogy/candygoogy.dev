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

test(
  "a reload partway down shows the hero settled, and one at the top still plays it",
  OPTIONS,
  async (t) => {
    const page = await home(t, 1366, 600);
    // The hero's line, every frame for the first 1.5s after a load.
    await page.context().addInitScript(() => {
      const frames = [];
      window.__frames = frames;
      const tick = () => {
        const lede = document.querySelector(".hero .statement > p.rv");
        if (lede) {
          const style = getComputedStyle(lede);
          const r = lede.getBoundingClientRect();
          frames.push({
            y: scrollY,
            seen: r.bottom > 0 && r.top < innerHeight,
            transform: style.transform,
            opacity: style.opacity,
            intro: document.documentElement.classList.contains("intro-on"),
          });
        }
        if (performance.now() < 1500) requestAnimationFrame(tick);
        else window.__done = true;
      };
      requestAnimationFrame(tick);
    });
    const reload = async () => {
      await page.reload();
      await page.waitForFunction(() => window.__done);
      return page.evaluate(() => window.__frames);
    };
    const AT_REST = ["none", "matrix(1, 0, 0, 1, 0, 0)"];

    await scrollTo(page, ".hero .statement > p.rv", 0.1);
    await page.waitForTimeout(500);
    const down = (await reload()).filter((f) => f.y > 0);
    assert.ok(down.length > 0, "the scroll was never restored");
    assert.ok(
      down.every((f) => f.seen),
      "the line was out of the window",
    );
    assert.ok(
      down.every((f) => !f.intro),
      "the intro curtain played",
    );
    const moved = down.filter(
      (f) => !AT_REST.includes(f.transform) || f.opacity !== "1",
    );
    assert.equal(
      moved.length,
      0,
      `the line moved after the scroll came back: ${JSON.stringify(moved[0])}`,
    );

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(500);
    const top = await reload();
    assert.ok(top.every((f) => f.y === 0));
    assert.ok(
      top.some((f) => f.opacity !== "1"),
      "the hero didn't play its entrance",
    );
  },
);

test(
  "a reload partway down lands where the page was left",
  OPTIONS,
  async (t) => {
    const page = await home(t, 1567, 780);
    for (const left of [473, 1200]) {
      await page.evaluate(
        (y) => window.scrollTo({ top: y, behavior: "instant" }),
        left,
      );
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(2000);
      const landed = await page.evaluate(() => scrollY);
      assert.ok(
        Math.abs(landed - left) <= 2,
        `left at ${left}, landed at ${landed}`,
      );
    }
  },
);

test(
  "coming Back to a page left partway down lands where it was left",
  OPTIONS,
  async (t) => {
    // Playwright's browser has no back/forward cache, so Back loads the
    // page again, as a browser that missed the cache would.
    const page = await home(t, 1567, 780);
    await page.evaluate(() =>
      window.scrollTo({ top: 473, behavior: "instant" }),
    );
    await page.waitForTimeout(500);
    await page.goto(new URL("/colophon", server.url).href);
    await page.waitForTimeout(800);
    await page.goBack();
    await page.waitForTimeout(2000);
    const landed = await page.evaluate(() => scrollY);
    assert.ok(Math.abs(landed - 473) <= 2, `left at 473, landed at ${landed}`);
  },
);
