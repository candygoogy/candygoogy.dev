// The home page's intro curtain (src/components/Curtain.astro), reduced
// motion, a back/forward cache restore, axe on every page, and the 404's
// social tags, against the built site. Needs `npm run build` first.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { after, before, test } from "node:test";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let server;
let browser;
// Playwright turns the back/forward cache off, and its headless shell
// can't use it: for the restore, full Chromium (new headless) with it on.
let cached;

before(async () => {
  server = await serve();
  browser = await chromium.launch();
  cached = await chromium.launch({
    channel: "chromium",
    ignoreDefaultArgs: ["--disable-back-forward-cache"],
  });
});

after(async () => {
  await browser?.close();
  await cached?.close();
  await server?.close();
});

const OPTIONS = { timeout: 60_000 };

// The 404 page is what an unknown path gets (tests/e2e/server.mjs).
const MISSING = "/no/such/page";
// Every page in the build; the 404 is opened as a visitor meets it.
const PAGES = readdirSync(new URL("../../dist/", import.meta.url))
  .filter((file) => file.endsWith(".html"))
  .map((file) => {
    if (file === "404.html") return MISSING;
    return file === "index.html" ? "/" : `/${file.slice(0, -5)}`;
  });

// A fresh context in `on` (a browser), with the intro left to play unless
// `seen`. Everything a page reports (a CSP violation, a console error, an
// uncaught exception) lands in `problems` as it happens. The page isn't
// opened yet: the caller goes where it needs to.
async function fresh(
  t,
  { on = browser, seen = false, theme = null, ...options } = {},
) {
  const context = await on.newContext({
    viewport: { width: 1280, height: 800 },
    ...options,
  });
  const problems = [];
  t.after(async () => {
    await context.close();
    assert.deepEqual(problems, [], "the page reported problems");
  });
  await context.exposeFunction("__cspViolation", (v) =>
    problems.push(`CSP: ${v}`),
  );
  await context.addInitScript(
    ({ seen, theme }) => {
      if (seen) sessionStorage.setItem("intro-seen", "1");
      if (theme) localStorage.setItem("theme", theme);
      document.addEventListener("securitypolicyviolation", (e) => {
        window.__cspViolation(
          `${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"}` +
            ` at ${e.sourceFile || location.href}:${e.lineNumber}`,
        );
      });
    },
    { seen, theme },
  );
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location();
    // The 404 page's own status, which is the point of it.
    if (where.url.endsWith(MISSING) && /\b404\b/.test(m.text())) return;
    problems.push(`console: ${m.text()} (${where.url}:${where.lineNumber})`);
  });
  page.on("pageerror", (e) =>
    problems.push(`pageerror: ${e.stack || `${e.name}: ${e.message}`}`),
  );
  return { context, page };
}

const url = (path) => new URL(path, server.url).href;

test(
  "a first visit plays the intro, and the curtain lifts off a visible hero",
  OPTIONS,
  async (t) => {
    const { page } = await fresh(t);
    // How the intro started, and when the curtain let the page go (ms
    // since the navigation started).
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.documentElement;
        window.__start = {
          on: root.classList.contains("intro-on"),
          hold: root.classList.contains("intro-hold"),
          curtain: !!document.querySelector(".curtain"),
        };
      });
      addEventListener("intro:release", () => {
        window.__released = performance.now();
      });
    });
    await page.goto(url("/"));
    assert.deepEqual(
      await page.evaluate(() => window.__start),
      { on: true, hold: true, curtain: true },
      "the intro didn't start",
    );
    // A bit past the 2.6s failsafe: the curtain gone, the page let go, and
    // the real wordmark back in the header.
    const BOUND = 3200;
    await page.waitForFunction(
      () => {
        const root = document.documentElement;
        return (
          !document.querySelector(".curtain") &&
          !root.classList.contains("intro-on") &&
          !root.classList.contains("intro-hold")
        );
      },
      null,
      { timeout: BOUND },
    );
    const landed = await page.evaluate(() => ({
      at: performance.now(),
      released: window.__released,
      brand: getComputedStyle(document.querySelector(".top .brand")).visibility,
      // Nothing in the hero is still held.
      paused: document
        .querySelector(".hero")
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "paused").length,
      seen: sessionStorage.getItem("intro-seen"),
    }));
    assert.ok(landed.at <= BOUND, `the curtain went at ${landed.at}ms`);
    // Released by the curtain's own script, not the failsafe.
    assert.ok(
      landed.released > 0 && landed.released < 2600,
      `released at ${landed.released}ms`,
    );
    assert.deepEqual(
      { brand: landed.brand, paused: landed.paused, seen: landed.seen },
      { brand: "visible", paused: 0, seen: "1" },
    );
    // The hero's entrance runs to the end, and it's all there.
    const hero = await page.evaluate(async () => {
      const hero = document.querySelector(".hero");
      await Promise.all(
        hero.getAnimations({ subtree: true }).map((a) => a.finished),
      );
      const hidden = [
        ...hero.querySelectorAll(".hero-title .w > span, .rv"),
      ].filter((el) => {
        const style = getComputedStyle(el);
        return (
          style.opacity !== "1" ||
          style.visibility !== "visible" ||
          style.transform !== "none"
        );
      });
      return { at: performance.now(), hidden: hidden.length };
    });
    assert.equal(hero.hidden, 0, "hero elements not in their resting state");
    assert.ok(hero.at <= 5000, `the hero settled at ${hero.at}ms`);
  },
);

test(
  "the curtain lets the page go as its edge reaches the headline",
  OPTIONS,
  async (t) => {
    const { page } = await fresh(t, { viewport: { width: 1440, height: 900 } });
    // Where the panel's edge and the headline are when the page is let go,
    // and how far into the intro that is (the panel's clock).
    await page.addInitScript(() => {
      addEventListener("intro:release", () => {
        const panel = document.querySelector(".curtain .panel");
        const inset = getComputedStyle(panel).clipPath.match(
          /inset\(\s*\S+\s+\S+\s+([\d.]+)%/,
        );
        window.__edge = {
          inset: inset ? Number(inset[1]) : null,
          title: document.querySelector(".hero-title").getBoundingClientRect()
            .bottom,
          H: innerHeight,
          at: panel.getAnimations()[0]?.currentTime ?? null,
        };
      });
    });
    await page.goto(url("/"));
    await page.waitForFunction(() => window.__edge !== undefined, null, {
      timeout: 3200,
    });
    const e = await page.evaluate(() => window.__edge);
    assert.ok(
      e.inset !== null,
      `no clip-path inset read: ${JSON.stringify(e)}`,
    );
    const edge = e.H * (1 - e.inset / 100);
    const seen = `edge ${edge.toFixed(0)}px, headline bottom ${e.title.toFixed(0)}px, at ${e.at}ms`;
    // The lift is underway, and its edge hasn't passed the headline yet, so the words don't spend their rise under the panel.
    assert.ok(
      e.title < edge && edge < 0.95 * e.H,
      `the edge wasn't between the headline and the lift's start: ${seen}`,
    );
    t.diagnostic(seen);
  },
);

test(
  "coming home from another page of the site plays no intro",
  OPTIONS,
  async (t) => {
    // A tab that landed on /projects, then follows the header's wordmark.
    const { page } = await fresh(t);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.documentElement;
        window.__start = {
          on: root.classList.contains("intro-on"),
          hold: root.classList.contains("intro-hold"),
        };
      });
    });
    await page.goto(url("/projects"));
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("intro-seen")),
      "1",
      "/projects didn't mark the session seen",
    );
    await page.locator("header.top a.brand").first().click();
    await page.waitForURL(url("/"));
    await page.waitForFunction(() => window.__start !== undefined);
    const r = await page.evaluate(() => ({
      start: window.__start,
      curtain: getComputedStyle(document.querySelector(".curtain")).display,
    }));
    assert.deepEqual(r, {
      start: { on: false, hold: false },
      curtain: "none",
    });
  },
);

test(
  "on a tall window the band waits under the curtain and rises with the lift",
  OPTIONS,
  async (t) => {
    // Tall enough that the band's top is above its reveal line on load.
    const { page } = await fresh(t, {
      viewport: { width: 1280, height: 1300 },
    });
    // Whether the band was ever shown while the curtain held the page.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.documentElement;
        const band = document.querySelector(".band.rv-band");
        window.__band = {
          top: band.getBoundingClientRect().top / innerHeight,
          early: false,
        };
        new MutationObserver(() => {
          if (
            band.classList.contains("is-in") &&
            root.classList.contains("intro-hold")
          ) {
            window.__band.early = true;
          }
        }).observe(band, { attributes: true, attributeFilter: ["class"] });
      });
    });
    await page.goto(url("/"));
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("intro-on"),
      null,
      { timeout: 3200 },
    );
    const r = await page.evaluate(async () => {
      const band = document.querySelector(".band.rv-band");
      await Promise.all(band.getAnimations().map((a) => a.finished));
      return {
        above: window.__band.top < 0.7,
        early: window.__band.early,
        // It rose with the lift, and ended open.
        classes: ["is-in", "from-intro"].filter((c) =>
          band.classList.contains(c),
        ),
        clip: getComputedStyle(band).clipPath,
      };
    });
    assert.deepEqual(r, {
      above: true,
      early: false,
      classes: ["is-in", "from-intro"],
      clip: "none",
    });
  },
);

test(
  "under reduced motion a first visit shows the page at once, with no intro",
  OPTIONS,
  async (t) => {
    const { page } = await fresh(t, { reducedMotion: "reduce" });
    await page.goto(url("/"));
    const r = await page.evaluate(() => {
      const root = document.documentElement;
      const hero = document.querySelector(".hero");
      const hidden = [
        ...document.querySelectorAll(".hero-title .w > span, .rv"),
      ].filter((el) => {
        const style = getComputedStyle(el);
        return (
          style.opacity !== "1" ||
          style.visibility !== "visible" ||
          style.transform !== "none"
        );
      });
      return {
        // The head script never starts the intro, so the curtain is never
        // drawn and nothing waits for it.
        intro: ["intro-on", "intro-hold", "intro-played"].filter((c) =>
          root.classList.contains(c),
        ),
        curtain: getComputedStyle(document.querySelector(".curtain")).display,
        brand: getComputedStyle(document.querySelector(".top .brand"))
          .visibility,
        // The hero doesn't enter, and no reveal starts hidden.
        moving: hero.getAnimations({ subtree: true }).length,
        hidden: hidden.length,
      };
    });
    assert.deepEqual(r, {
      intro: [],
      curtain: "none",
      brand: "visible",
      moving: 0,
      hidden: 0,
    });
  },
);

test(
  "coming back from /colophon restores the home page as it was left, in the theme chosen since",
  OPTIONS,
  async (t) => {
    const { context: ctx, page } = await fresh(t, {
      on: cached,
      seen: true,
    });
    await page.addInitScript(() => {
      addEventListener("pageshow", (e) => {
        window.__persisted = e.persisted;
      });
    });
    // Why the cache wasn't used, if it wasn't.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Page.enable");
    const notUsed = [];
    cdp.on("Page.backForwardCacheNotUsed", (e) =>
      notUsed.push(...e.notRestoredExplanations.map((x) => x.reason)),
    );

    await page.goto(url("/"));
    await page.waitForFunction(
      () =>
        document.readyState === "complete" &&
        !document.querySelector("header.top").classList.contains("still"),
    );
    // Down to the footer, as a reader would, and past what that reveals.
    const link = page.locator('footer a[href="/colophon"]');
    await link.scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      const running = () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.playState === "running" &&
              a.effect?.getComputedTiming().endTime !== Infinity,
          );
      for (let list = running(); list.length; list = running()) {
        await Promise.all(list.map((a) => a.finished.catch(() => {})));
      }
    });
    // Marks this document, so a restore can be told from a reload.
    const left = await page.evaluate(() => {
      window.__left = true;
      return scrollY;
    });
    await link.click();
    await page.waitForURL(url("/colophon"));
    await page.waitForFunction(() => document.readyState === "complete");
    // Dark, chosen on /colophon after leaving the home page.
    await page
      .locator('header > .tools [data-theme-switch] button[data-value="dark"]')
      .click();
    await page.waitForFunction(
      () =>
        document.documentElement.dataset.theme === "dark" &&
        !document.documentElement.classList.contains("theme-vt"),
    );

    // A restore fires no load event: back once the document is in.
    await page.goBack({ waitUntil: "commit" });
    await page.waitForFunction(() => window.__persisted !== undefined);
    const restored = await page.evaluate(() => ({
      persisted: window.__persisted,
      same: window.__left === true,
    }));
    assert.deepEqual(
      restored,
      { persisted: true, same: true },
      `not restored from the back/forward cache: ${notUsed.join(", ")}`,
    );
    // Past a frame, when the theme switch's restore has tidied up.
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    const r = await page.evaluate(() => {
      const root = document.documentElement;
      const header = document.querySelector("header.top");
      // In view and meant to be seen, but not.
      const hidden = [
        ...document.querySelectorAll(
          ".rv, .rv-mask, .rv-line, .rv-band, .line-title, .hero-title .w > span",
        ),
      ].filter((el) => {
        const box = el.getBoundingClientRect();
        if (!box.width || box.bottom <= 0 || box.top >= innerHeight) {
          return false;
        }
        const style = getComputedStyle(el);
        return style.opacity !== "1" || style.visibility !== "visible";
      });
      return {
        path: location.pathname,
        y: scrollY,
        theme: root.dataset.theme ?? "auto",
        pressed: [
          ...document.querySelectorAll(
            "header > .tools [data-theme-switch] button[aria-pressed='true']",
          ),
        ].map((b) => b.dataset.value),
        // Nothing passing left on: a wipe, a restore, the menu, a jump.
        transient: [
          "theme-vt",
          "theme-switching",
          "theme-restore",
          "menu-on",
          "menu-jump",
          "intro-on",
          "intro-hold",
        ].filter((c) => root.classList.contains(c)),
        // Wide, the header is in the page, up past the top at the footer.
        header: {
          still: header.classList.contains("still"),
          away: header.classList.contains("away"),
          brand: getComputedStyle(header.querySelector(".brand")).visibility,
        },
        hidden: hidden.map((el) => el.className),
      };
    });
    assert.deepEqual(r, {
      path: "/",
      y: left,
      theme: "dark",
      pressed: ["dark"],
      transient: [],
      header: { still: false, away: false, brand: "visible" },
      hidden: [],
    });
  },
);

// Each page at rest (reduced motion, so nothing is caught mid-reveal), in
// each theme, against the WCAG A and AA rules scripts/shots.mjs uses.
for (const theme of ["light", "dark"]) {
  test(
    `axe finds nothing serious or critical on any page, ${theme}`,
    OPTIONS,
    async (t) => {
      const { page } = await fresh(t, {
        seen: true,
        theme,
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const found = [];
      for (const path of PAGES) {
        await page.goto(url(path), { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        const { passes, violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        // It checked the page, not an empty one.
        assert.ok(
          passes.some((p) => p.id === "color-contrast"),
          `${path}: contrast wasn't checked`,
        );
        for (const v of violations) {
          if (v.impact !== "serious" && v.impact !== "critical") continue;
          found.push(
            `${path} ${v.id} (${v.impact}, ${v.nodes.length}): ` +
              v.nodes.map((n) => n.target.join(" ")).join("; "),
          );
        }
      }
      assert.deepEqual(found, []);
    },
  );
}

test(
  "the 404 page has no og:url or canonical link, and every other page has both",
  OPTIONS,
  async (t) => {
    const { page } = await fresh(t, { seen: true });
    const tags = {};
    for (const path of PAGES) {
      await page.goto(url(path));
      tags[path] = await page.evaluate(() => ({
        ogUrl: !!document.querySelector('meta[property="og:url"]'),
        canonical: !!document.querySelector('link[rel="canonical"]'),
      }));
    }
    assert.ok(MISSING in tags && "/" in tags, "the 404 and / were checked");
    const expected = Object.fromEntries(
      PAGES.map((path) => {
        const indexed = path !== MISSING;
        return [path, { ogUrl: indexed, canonical: indexed }];
      }),
    );
    assert.deepEqual(tags, expected);
  },
);
