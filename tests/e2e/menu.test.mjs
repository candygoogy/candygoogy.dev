// The phone menu (src/components/Header.astro), against the built site.
// Needs `npm run build` first.
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

// A phone-sized home page, with the intro curtain skipped. Every page it
// opens is watched: a CSP violation (the pages' policy is hash-based,
// scripts/csp.mjs), a console error or an uncaught exception fails the
// test once it's done. Violations are reported to Node as they happen, so
// one on a page the test has since navigated away from still counts.
async function phone(t, width = 390, height = 844) {
  const context = await browser.newContext({ viewport: { width, height } });
  const problems = [];
  t.after(async () => {
    await context.close();
    assert.deepEqual(problems, [], "the page reported problems");
  });
  await context.exposeFunction("__cspViolation", (v) =>
    problems.push(`CSP: ${v}`),
  );
  // /api/presence is the Worker's, which this static server doesn't run:
  // answer as the Worker does with no status (the badge stays hidden, as
  // it would on the 404), so the 404 isn't reported as a console error.
  await context.route("**/api/presence", (route) =>
    route.fulfill({ json: { status: null } }),
  );
  await context.addInitScript(() => {
    sessionStorage.setItem("intro-seen", "1");
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolation(
        `${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"}` +
          ` at ${e.sourceFile || location.href}:${e.lineNumber}`,
      );
    });
    // The page's motion (scripts/loader.ts) is started after first paint
    // as the one module script with a src; its load event means it ran.
    document.addEventListener(
      "load",
      (e) => {
        if (e.target.matches?.('script[type="module"][src]')) {
          window.__motion = true;
        }
      },
      true,
    );
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") {
      const { url, lineNumber } = m.location();
      problems.push(`console: ${m.text()} (${url}:${lineNumber})`);
    }
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.stack ?? e}`));
  await page.goto(server.url);
  // Loaded, and the header past its arrival (it drops .still once the page
  // has stopped moving), with the page's own motion started.
  await page.waitForFunction(
    () =>
      document.readyState === "complete" &&
      !document.querySelector("header.top").classList.contains("still") &&
      window.__motion === true,
  );
  await settled(page, "html");
  return page;
}

// Every running, finite animation and transition on `selector` and inside
// it has finished (paused ones, like a reveal waiting to be scrolled to,
// and infinite ones never do, and are left out).
async function settled(page, selector) {
  await page.evaluate(async (selector) => {
    const el = document.querySelector(selector);
    const running = () =>
      el
        .getAnimations({ subtree: true })
        .filter(
          (a) =>
            a.playState === "running" &&
            a.effect?.getComputedTiming().endTime !== Infinity,
        );
    for (let list = running(); list.length; list = running()) {
      await Promise.all(list.map((a) => a.finished.catch(() => {})));
    }
  }, selector);
}

// The page has stopped scrolling and the header has stopped sliding: the
// same scroll position and no header animation for several frames in a
// row (a smooth scroll, once started, moves every frame).
async function still(page) {
  await page.evaluate(
    () =>
      new Promise((done) => {
        const header = document.querySelector("header.top");
        let last = NaN;
        let calm = 0;
        const frame = () => {
          const moving = header.getAnimations().length > 0;
          calm = scrollY === last && !moving ? calm + 1 : 0;
          last = scrollY;
          if (calm >= 5) done();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
}

// Open, and past the menu's opening motion.
async function openMenu(page) {
  await page.locator("[data-menu-open]").click();
  await menuOpened(page);
}

async function menuOpened(page) {
  await page.waitForFunction(() => document.querySelector("[data-menu]").open);
  await settled(page, "[data-menu]");
}

const OPTIONS = { timeout: 60_000 };

test(
  "closing, then reopening at once, leaves the menu open",
  OPTIONS,
  async (t) => {
    const page = await phone(t);
    await openMenu(page);
    await page.locator("[data-menu-close]").click();
    // The fade (~200ms) ends and the menu closes; reopen well inside the
    // close's 400ms fallback.
    await page.waitForFunction(
      () => !document.querySelector("[data-menu]").open,
    );
    await page.locator("[data-menu-open]").click();
    // Deliberately a fixed wait: this checks that nothing happens. A stale
    // fallback from the close would fire within 400ms of it; 700ms is well
    // past that.
    await page.waitForTimeout(700);
    const open = await page.locator("[data-menu]").evaluate((m) => m.open);
    assert.equal(open, true, "the old close timer closed the reopened menu");
  },
);

test(
  "Shift+Tab up the projects never lands focus under the header",
  OPTIONS,
  async (t) => {
    const page = await phone(t);
    const count = await page.locator("#projects a.go").count();
    assert.ok(count >= 2, `at least two project links (found ${count})`);
    const covered = [];
    for (let i = count - 2; i >= 0; i--) {
      // Link i just under the top edge, reached scrolling down (so the
      // header is away), with focus on the next link.
      const to = await page.evaluate((i) => {
        const links = document.querySelectorAll("#projects a.go");
        const y = scrollY + links[i].getBoundingClientRect().top - 10;
        scrollTo({ top: y - 100, behavior: "instant" });
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            scrollTo({ top: y, behavior: "instant" }),
          ),
        );
        links[i + 1].focus({ preventScroll: true });
        // Where it ends up (near the bottom, as far as the page goes).
        const max = document.documentElement.scrollHeight - innerHeight;
        return Math.min(y, max);
      }, i);
      // There, with the header slid away (the first scroll, up, brought it
      // back, so a stale .away can't pass) and done sliding.
      await page.waitForFunction(
        (to) =>
          Math.abs(scrollY - to) < 1 &&
          document.querySelector("header.top").classList.contains("away"),
        to,
      );
      await still(page);
      await page.keyboard.press("Shift+Tab");
      // Past the smooth scroll and the header's slide.
      await page.waitForFunction(
        (i) =>
          document.activeElement ===
          document.querySelectorAll("#projects a.go")[i],
        i,
      );
      await still(page);
      const r = await page.evaluate(() => {
        const a = document.activeElement.getBoundingClientRect();
        const h = document.querySelector("header.top").getBoundingClientRect();
        return {
          href: document.activeElement.getAttribute("href"),
          top: a.top,
          header: Math.max(h.bottom, 0),
        };
      });
      if (r.top < r.header) {
        covered.push(`${r.href}: top ${r.top} < header ${r.header}`);
      }
    }
    assert.deepEqual(covered, []);
  },
);

test(
  "widening past the phone layout moves focus to the header's link",
  OPTIONS,
  async (t) => {
    const page = await phone(t);
    await page.locator("[data-menu-open]").focus();
    await page.keyboard.press("Enter");
    await menuOpened(page);
    await page.locator('[data-menu] .route a:has-text("About")').focus();
    await page.setViewportSize({ width: 1024, height: 844 });
    // Closed: Menu's aria-expanded goes back to false as focus moves on.
    await page.waitForFunction(
      () =>
        !document.querySelector("[data-menu]").open &&
        document
          .querySelector("[data-menu-open]")
          .getAttribute("aria-expanded") === "false",
    );
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      const box = el.getBoundingClientRect();
      return {
        open: document.querySelector("[data-menu]").open,
        visible: el !== document.body && box.width > 0 && box.height > 0,
        nav: !!el.closest("header > .nav") && el.textContent.trim() === "About",
      };
    });
    assert.deepEqual(r, { open: false, visible: true, nav: true });
  },
);

test(
  "rotating with the menu open keeps its top row level with the header",
  OPTIONS,
  async (t) => {
    const page = await phone(t);
    await openMenu(page);
    await page.setViewportSize({ width: 700, height: 390 });
    // The resize has reached the page and its handler has run (resize
    // events are dispatched before the next frame's callbacks).
    await page.waitForFunction(() => innerWidth === 700 && innerHeight === 390);
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    await settled(page, "[data-menu]");
    const r = await page.evaluate(() => ({
      open: document.querySelector("[data-menu]").open,
      header: document.querySelector("header > .brand").getBoundingClientRect()
        .left,
      menu: document.querySelector("[data-menu] .brand").getBoundingClientRect()
        .left,
    }));
    assert.equal(r.open, true);
    assert.ok(
      Math.abs(r.header - r.menu) < 0.5,
      `wordmark left: header ${r.header}, menu ${r.menu}`,
    );
  },
);

test(
  "the menu's About lands the section about 24px from the top",
  OPTIONS,
  async (t) => {
    const page = await phone(t);
    await openMenu(page);
    await page.locator('[data-menu] .route a:has-text("About")').click();
    // The menu fades and closes, then the page jumps; the jump is over
    // once html.menu-jump is gone and nothing moves.
    await page.waitForFunction(
      () =>
        !document.querySelector("[data-menu]").open &&
        !document.documentElement.classList.contains("menu-jump") &&
        scrollY > 0,
    );
    await still(page);
    const r = await page.evaluate(() => ({
      section: document.getElementById("about").getBoundingClientRect().top,
      header: document.querySelector("header.top").getBoundingClientRect()
        .bottom,
    }));
    assert.ok(
      Math.abs(r.section - 24) <= 4,
      `#about top ${r.section}px (header bottom ${r.header}px)`,
    );
    assert.ok(
      r.header <= r.section,
      `header bottom ${r.header}px covers #about at ${r.section}px`,
    );
  },
);

test(
  "a link to a section lands it clear of the header's measured height",
  OPTIONS,
  async (t) => {
    const page = await phone(t);
    // /uses links to its own sections.
    await page.goto(new URL("/uses", server.url).href);
    await page.waitForFunction(
      () =>
        document.readyState === "complete" &&
        !document.querySelector("header.top").classList.contains("still"),
    );
    await page.locator('a.shift[href="#desktop"]').click();
    await page.waitForFunction(() => location.hash === "#desktop");
    await still(page);
    const r = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const header = document.querySelector("header.top");
      const section = document.getElementById("desktop");
      return {
        measured: parseFloat(html.getPropertyValue("--header-h")),
        padding: parseFloat(html.scrollPaddingTop),
        margin: parseFloat(getComputedStyle(section).scrollMarginTop),
        // Where its bottom is when it's in place at the top of the window
        // (it may have slid away).
        header: header.offsetHeight,
        height: header.getBoundingClientRect().height,
        section: section.getBoundingClientRect().top,
      };
    });
    assert.ok(
      Math.abs(r.measured - r.height) < 0.5,
      `--header-h ${r.measured}px, header ${r.height}px tall`,
    );
    // The header's measured height plus the usual room (24px).
    assert.ok(
      Math.abs(r.padding - (r.measured + 24)) < 0.5,
      `scroll-padding-top ${r.padding}px, header ${r.measured}px`,
    );
    assert.ok(
      r.section >= r.header,
      `header bottom ${r.header}px covers #desktop at ${r.section}px`,
    );
    // Where the scroll padding and the section's own margin put it.
    assert.ok(
      Math.abs(r.section - (r.padding + r.margin)) <= 4,
      `#desktop at ${r.section}px, expected ${r.padding + r.margin}px`,
    );
  },
);

test(
  "scrolling down a wide page leaves the header where it is",
  OPTIONS,
  async (t) => {
    const page = await phone(t, 1280, 800);
    await page.mouse.move(640, 400);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 400);
      await still(page);
    }
    const r = await page.evaluate(() => ({
      y: scrollY,
      away: document.querySelector("header.top").classList.contains("away"),
    }));
    assert.ok(r.y > 1000, `scrolled to ${r.y}px`);
    assert.equal(r.away, false, "the header was marked away on a wide page");
  },
);

test(
  "the open menu reaches the route before the project index",
  OPTIONS,
  async (t) => {
    const page = await phone(t);
    await page.locator("[data-menu-open]").focus();
    await page.keyboard.press("Enter");
    await menuOpened(page);
    // From Close (where a keyboard open puts focus), the next stop is the
    // route's first; the index's links come after the route's last.
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const menu = document.querySelector("[data-menu]");
      const route = menu.querySelector(".route");
      const index = menu.querySelector("[data-menu-index]");
      return {
        first: route.querySelector("a") === document.activeElement,
        before: !!(
          route.compareDocumentPosition(index) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
      };
    });
    assert.deepEqual(r, { first: true, before: true });
  },
);
