// Every built page, and the theme switch, against the built site.
// Needs `npm run build` first.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { frontmatter, frontmatterFlag } from "../../scripts/github-days.mjs";
import { featuredProject } from "../../src/data/site.ts";
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

// The 404 page is what an unknown path gets (tests/e2e/server.mjs, as the
// assets binding does).
const MISSING = "/no/such/page";
// Every page in the build (index.html is /, about.html is /about), so a
// new one is swept too. The 404 is opened as a visitor meets it.
const PAGES = readdirSync(new URL("../../dist/", import.meta.url))
  .filter((file) => file.endsWith(".html"))
  .map((file) => {
    if (file === "404.html") return MISSING;
    return file === "index.html" ? "/" : `/${file.slice(0, -5)}`;
  });

// A fresh context on `path`, with the intro curtain skipped, loaded and
// with the page's own motion started. Everything it reports (a CSP
// violation, a console error, an uncaught exception) lands in `problems`
// as it happens, on the Node side.
async function open(
  path,
  { viewport = { width: 1280, height: 800 }, status = null } = {},
) {
  const context = await browser.newContext({ viewport });
  const problems = [];
  // The test server answers /api/presence with no status; a test that
  // needs one routes it (which turns off the browser's HTTP cache).
  if (status !== null) {
    await context.route("**/api/presence", (route) =>
      route.fulfill({ json: { status } }),
    );
  }
  await context.exposeFunction("__cspViolation", (v) =>
    problems.push(`CSP: ${v}`),
  );
  await context.addInitScript(() => {
    sessionStorage.setItem("intro-seen", "1");
    document.addEventListener("securitypolicyviolation", (e) => {
      window.__cspViolation(
        `${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"}` +
          ` at ${e.sourceFile || location.href}:${e.lineNumber}`,
      );
    });
    // The page's motion (scripts/loader.ts) is the one module script with
    // a src; its load event means it ran.
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
  const url = new URL(path, server.url).href;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location();
    // The 404 page's own status, which is the point of it.
    if (path === MISSING && where.url === url && /\b404\b/.test(m.text())) {
      return;
    }
    problems.push(`console: ${m.text()} (${where.url}:${where.lineNumber})`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.stack ?? e}`));
  await page.goto(url);
  await page.waitForFunction(
    () => document.readyState === "complete" && window.__motion === true,
  );
  return { context, page, problems };
}

for (const path of PAGES) {
  test(
    `${path}: no CSP violations or console errors, every data- stagger mapped`,
    OPTIONS,
    async () => {
      const { context, page, problems } = await open(path);
      try {
        // Down to the bottom, so what loads or reveals on scroll runs too.
        await page.evaluate(() =>
          scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
        );
        await page.waitForLoadState("networkidle");

        // data-i/-w/-d/-line are mapped to --i/--w/--d/--line-color by
        // motion.css, one rule per value; a value with no rule silently
        // gets no stagger (or inherits a parent's). Each must compute to
        // exactly its own value.
        const unmapped = await page.evaluate(() => {
          const ms = (v) =>
            v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
          const name = (el) =>
            el.tagName.toLowerCase() +
            (el.id ? `#${el.id}` : "") +
            [...el.classList].map((c) => `.${c}`).join("");
          const bad = [];
          for (const el of document.querySelectorAll(
            "[data-i], [data-w], [data-d], [data-line]",
          )) {
            const style = getComputedStyle(el);
            const check = (attr, prop, ok) => {
              const value = el.getAttribute(attr);
              if (value === null) return;
              const got = style.getPropertyValue(prop).trim();
              if (!got || !ok(value, got)) {
                bad.push(`${name(el)} ${attr}="${value}": ${prop} is "${got}"`);
              }
            };
            const count = (value, got) => Number(got) === Number(value);
            check("data-i", "--i", count);
            check("data-w", "--w", count);
            check(
              "data-d",
              "--d",
              (value, got) => Math.round(ms(got)) === Number(value),
            );
            check(
              "data-line",
              "--line-color",
              (value, got) =>
                got === style.getPropertyValue(`--${value}`).trim(),
            );
          }
          return bad;
        });
        assert.deepEqual(unmapped, [], "data- attributes without a rule");
      } finally {
        await context.close();
      }
      assert.deepEqual(problems, [], "the page reported problems");
    },
  );
}

test(
  "a Discord status shows on the contact card, and the name settles above it",
  OPTIONS,
  async () => {
    const { context, page, problems } = await open("/", { status: "online" });
    try {
      const badge = page.locator("#contact [data-presence]");
      await badge.scrollIntoViewIfNeeded();
      await badge.getByText("Online on Discord", { exact: true }).waitFor();
      assert.equal(await badge.getAttribute("data-status"), "online");
      // Past the rise and the name's glide: the name back in its own place.
      const settled = await badge.evaluate(async (el) => {
        const name = el.parentElement.querySelector(".name");
        await Promise.all(
          [el, name].flatMap((e) => e.getAnimations()).map((a) => a.finished),
        );
        return {
          shown: getComputedStyle(el).visibility,
          opacity: getComputedStyle(el).opacity,
          name: getComputedStyle(name).transform,
        };
      });
      assert.deepEqual(settled, {
        shown: "visible",
        opacity: "1",
        name: "none",
      });
    } finally {
      await context.close();
    }
    assert.deepEqual(problems, [], "the page reported problems");
  },
);

test(
  "the theme switch applies a choice, and the last of quick clicks wins",
  OPTIONS,
  async () => {
    const { context, page, problems } = await open("/");
    try {
      const group = page.locator("header > .tools [data-theme-switch]");
      const theme = () =>
        page.evaluate(() => ({
          theme: document.documentElement.dataset.theme ?? "auto",
          stored: localStorage.getItem("theme"),
          pressed: [
            ...document.querySelectorAll(
              "header > .tools [data-theme-switch] button[aria-pressed='true']",
            ),
          ].map((b) => b.dataset.value),
        }));
      // Past any wipe, on the expected theme.
      const landed = (value) =>
        page.waitForFunction(
          (value) =>
            (document.documentElement.dataset.theme ?? "auto") === value &&
            !document.documentElement.classList.contains("theme-vt"),
          value,
        );

      await group.locator('button[data-value="dark"]').click();
      await landed("dark");
      assert.deepEqual(await theme(), {
        theme: "dark",
        stored: "dark",
        pressed: ["dark"],
      });

      // Light; Dark mid-wipe (past the pill's 120ms slide); Light again
      // before that one's wipe starts. Clicked in the page, as a wipe
      // covers the page for pointer input while it runs.
      await page.evaluate(async () => {
        const button = (value) =>
          document.querySelector(
            `header > .tools [data-theme-switch] button[data-value="${value}"]`,
          );
        const wait = (ms) => new Promise((done) => setTimeout(done, ms));
        button("light").click();
        await wait(180);
        button("dark").click();
        await wait(40);
        button("light").click();
      });
      await landed("light");
      // Deliberately a fixed wait: nothing stale may follow. Any pending
      // wipe would start within 120ms and end well inside this.
      await page.waitForTimeout(1500);
      assert.deepEqual(await theme(), {
        theme: "light",
        stored: "light",
        pressed: ["light"],
      });
    } finally {
      await context.close();
    }
    assert.deepEqual(problems, [], "the page reported problems");
  },
);

test(
  "the footer links the source once, and on a phone its notes come first, in the markup's order",
  OPTIONS,
  async () => {
    // What the footer shows at each width: the stamp or not, and how the
    // © and the claim sit (side by side, or the claim under the ©) with
    // the gap between them. Phones keep 24px each way.
    const widths = {
      1280: { stamp: true, notes: "side", gap: 32 },
      390: { stamp: false, notes: "side", gap: 24 },
      360: { stamp: false, notes: "side", gap: 24 },
      320: { stamp: false, notes: "wrapped", gap: 24 },
    };
    for (const [width, expected] of Object.entries(widths)) {
      const { context, page, problems } = await open("/", {
        viewport: { width: Number(width), height: 844 },
      });
      try {
        const r = await page.evaluate(() => {
          const footer = document.querySelector("footer");
          const inner = footer.querySelector(".inner");
          const links = [...inner.querySelectorAll(":scope > a")];
          const tops = links.map((a) => a.getBoundingClientRect().top);
          const stamp = footer.querySelector(".notes > .stamp");
          const [copy, claim] = [
            ...footer.querySelectorAll(".notes > span:not(.stamp)"),
          ].map((span) => span.getBoundingClientRect());
          const shown = [...footer.querySelectorAll(".notes > span")]
            .filter((span) => span.checkVisibility())
            .map((span) => span.getBoundingClientRect());
          // A link's target: its text box, or 44px centred on it where the
          // text is shorter (the ::after in Footer.astro).
          const target = (a) => {
            const b = a.getBoundingClientRect();
            const middle = b.top + b.height / 2;
            return {
              top: Math.min(b.top, middle - 22),
              bottom: Math.max(b.bottom, middle + 22),
            };
          };
          const noteLinks = [...footer.querySelectorAll(".notes a")].filter(
            (a) => a.checkVisibility(),
          );
          const near = (a, b) => Math.abs(a - b) < 1;
          // The same font on one baseline: the same bottom edge.
          const side = near(copy.bottom, claim.bottom);
          const wrapped =
            claim.top >= copy.bottom && near(claim.left, copy.left);
          const label = (el) =>
            el.className.split(" ")[0] || el.textContent.trim();
          return {
            // The repo is linked from the build stamp's commit and from
            // /colophon, not again on its own.
            source: links.some((a) => /source/i.test(a.textContent)),
            // The notes come before the links in the markup, and nothing
            // reorders them, so Tab follows what you see.
            markup: [...inner.children].map(label),
            reordered: [...footer.querySelectorAll(".inner *")].some(
              (el) => getComputedStyle(el).order !== "0",
            ),
            stamp: stamp.checkVisibility() && stamp.offsetWidth > 0,
            notes: side ? "side" : wrapped ? "wrapped" : "neither",
            gap: Math.round(
              side ? claim.left - copy.right : claim.top - copy.bottom,
            ),
            oneRow: tops.every((top) => Math.abs(top - tops[0]) < 1),
            // Below every note shown, or level with them on a wide row.
            below:
              Math.min(...tops) >= Math.max(...shown.map((n) => n.bottom)) ||
              tops.every((top) => near(top, shown[0].top)),
            // The notes' links (the claim, and the commit where it shows)
            // keep their targets off the links' under them.
            clear:
              Math.min(...tops) < shown.at(-1).bottom ||
              Math.max(...noteLinks.map((a) => target(a).bottom)) <=
                Math.min(...links.map((a) => target(a).top)),
          };
        });
        assert.deepEqual(
          r,
          {
            source: false,
            markup: ["notes", "Colophon", "Uses", "Back to top", "printed"],
            reordered: false,
            stamp: expected.stamp,
            notes: expected.notes,
            gap: expected.gap,
            oneRow: true,
            below: true,
            clear: true,
          },
          `at ${width}px`,
        );
      } finally {
        await context.close();
      }
      assert.deepEqual(
        problems,
        [],
        `the page reported problems at ${width}px`,
      );
    }
  },
);

test(
  "/colophon's Source row names the same build as the footer's stamp",
  OPTIONS,
  async () => {
    const { context, page, problems } = await open("/colophon", {
      viewport: { width: 390, height: 844 },
    });
    try {
      const r = await page.evaluate(() => {
        const row = [...document.querySelectorAll(".colophon .row")].find(
          (el) => el.querySelector("dt")?.textContent.trim() === "Source",
        );
        const stamp = document.querySelector("footer .stamp");
        const build = (el) => {
          const time = el.querySelector("time");
          const commit = el.querySelector('a[href*="/commit/"]');
          return {
            datetime: time?.dateTime,
            date: time?.textContent.trim(),
            href: commit?.href,
            label: commit?.getAttribute("aria-label"),
            commit: commit?.textContent.trim(),
          };
        };
        return {
          text: row.querySelector("dd p").textContent.replace(/\s+/g, " "),
          row: build(row),
          stamp: build(stamp),
        };
      });
      assert.deepEqual(r.row, r.stamp);
      assert.ok(r.row.date, "the row has no date");
      // Spaces where Astro could drop them, and the "from" only with a
      // commit, as the stamp words it.
      const from = r.row.commit ? ` from ${r.row.commit}` : "";
      assert.equal(
        r.text.trim(),
        `The source is on GitHub. This version was built on ${r.row.date}${from}. ` +
          "A wider screen shows it in the footer too; on a phone, it’s only here.",
      );
    } finally {
      await context.close();
    }
    assert.deepEqual(problems, [], "the page reported problems");
  },
);

test(
  "/fettle: each fact's leader runs up to its value on the right edge, none on a phone",
  OPTIONS,
  async () => {
    const leaders = async (width) => {
      const { context, page, problems } = await open("/fettle", {
        viewport: { width, height: 900 },
      });
      try {
        const rows = await page.evaluate(() => {
          const edge = document
            .querySelector("dl.facts")
            .getBoundingClientRect().right;
          const dotted = (s) =>
            s.display !== "none" && s.borderBottomStyle === "dotted";
          return [...document.querySelectorAll("dl.facts > div")].map((row) => {
            const dt = row.querySelector("dt");
            const dd = row.querySelector("dd");
            // The value's text only (the links' padding reaches past their
            // words), and the Live dot, which comes first.
            const boxes = [...dd.querySelectorAll(".live")].flatMap((el) => [
              ...el.getClientRects(),
            ]);
            const text = document.createTreeWalker(dd, NodeFilter.SHOW_TEXT);
            while (text.nextNode()) {
              const range = document.createRange();
              range.selectNodeContents(text.currentNode);
              boxes.push(...[...range.getClientRects()].filter((r) => r.width));
            }
            const top = Math.min(...boxes.map((r) => r.top));
            const glyph = Math.min(
              ...boxes.filter((r) => r.top - top < 2).map((r) => r.left),
            );
            // The dots: drawn after the label (base.css), or back from the
            // value's first letter and cut off at the value's box.
            const after = getComputedStyle(dt, "::after");
            const value = dd.querySelector(".value");
            const before = value && getComputedStyle(value, "::before");
            let from = 0;
            let to = 0;
            if (dotted(after)) {
              to =
                dt.getBoundingClientRect().right -
                parseFloat(after.marginRight);
              from = to - parseFloat(after.width);
            } else if (before && dotted(before)) {
              to = glyph - parseFloat(before.marginRight);
              from = dd.getBoundingClientRect().left;
            }
            const label = document.createRange();
            label.selectNodeContents(dt);
            return {
              name: dt.textContent.trim(),
              shown: to - from >= 20,
              // The dots start after the label.
              after: from >= label.getBoundingClientRect().right,
              // The value under its label, not beside it.
              below:
                dd.getBoundingClientRect().top >=
                dt.getBoundingClientRect().bottom - 1,
              wrapped:
                dd.getBoundingClientRect().height >
                1.5 * parseFloat(getComputedStyle(dd).lineHeight),
              // From the last dot to the value's first letter.
              reach: glyph - to,
              // How far the value's last letter is from the list's edge.
              short: edge - Math.max(...boxes.map((r) => r.right)),
            };
          });
        });
        assert.ok(rows.length >= 3, "the facts are there");
        return rows;
      } finally {
        await context.close();
        assert.deepEqual(problems, [], "the page reported problems");
      }
    };
    let wrapped = 0;
    for (const width of [1440, 900]) {
      const rows = await leaders(width);
      for (const r of rows) {
        assert.ok(
          r.shown && r.after && !r.below,
          `${width}: a leader between ${r.name} and its value`,
        );
        // Every value ends on the list's right edge, wrapped or not.
        assert.ok(
          Math.abs(r.short) <= 1,
          `${width}: ${r.name} ends ${r.short}px from the edge`,
        );
        // The dots stop a step short of the value's first letter, as on a
        // printed receipt, without running into it.
        assert.ok(
          r.reach >= 0 && r.reach <= 14,
          `${width}: ${r.name}'s leader stops ${r.reach}px from its value`,
        );
      }
      wrapped += rows.filter((r) => r.wrapped).length;
    }
    assert.ok(wrapped > 0, "a value wraps (Built with) at 1440 or 900");
    const phone = await leaders(390);
    assert.ok(
      phone.every((r) => !r.shown && r.below),
      "390: no leaders, each value under its label",
    );
  },
);

test(
  "/idiff: the project's name breaks between words only",
  OPTIONS,
  async () => {
    for (const width of [1024, 320]) {
      const { context, page, problems } = await open("/idiff", {
        viewport: { width, height: 800 },
      });
      try {
        const r = await page.evaluate(() => ({
          words: [...document.querySelectorAll(".band .title .word")].map(
            (word) => {
              const tops = [...word.querySelectorAll(".l")].map(
                (l) => l.getBoundingClientRect().top,
              );
              return tops.every((top) => Math.abs(top - tops[0]) <= 1);
            },
          ),
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        }));
        assert.ok(r.words.length >= 2, `${width}: the name's words are there`);
        assert.deepEqual(
          r,
          { words: r.words.map(() => true), overflow: false },
          `${width}: a word split across lines, or the page scrolls sideways`,
        );
      } finally {
        await context.close();
      }
      assert.deepEqual(problems, [], "the page reported problems");
    }
  },
);

test(
  "Tab past the last link wraps to the skip link, and it shows in the window",
  OPTIONS,
  async () => {
    const { context, page, problems } = await open("/");
    try {
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      const bottom = await page.evaluate(() => scrollY);
      await page.locator("footer a").last().focus();
      // Past the last link focus may stop on the document itself first.
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("Tab");
        if (
          await page
            .locator(".skip")
            .evaluate((a) => a === document.activeElement)
        )
          break;
      }
      const skip = await page.locator(".skip").evaluate((a) => {
        const r = a.getBoundingClientRect();
        return {
          focused: a === document.activeElement,
          inside: r.top >= 0 && r.bottom <= innerHeight,
          // It comes to the reader; the page doesn't jump to its top.
          stayed: scrollY,
        };
      });
      assert.deepEqual(skip, { focused: true, inside: true, stayed: bottom });
    } finally {
      await context.close();
    }
    assert.deepEqual(problems, [], "the page reported problems");
  },
);

// The published projects, from their content files: the ids, kinds, and
// which are featured.
const PROJECTS = readdirSync(
  new URL("../../src/content/projects/", import.meta.url),
)
  .filter((file) => file.endsWith(".md"))
  .map((file) => {
    const front = frontmatter(
      readFileSync(
        new URL(`../../src/content/projects/${file}`, import.meta.url),
        "utf8",
      ),
    );
    return {
      id: file.slice(0, -".md".length),
      kind: /^kind:[ \t]*(\w+)/m.exec(front)?.[1],
      featured: frontmatterFlag(front, "featured"),
      draft: frontmatterFlag(front, "draft"),
    };
  })
  .filter((p) => !p.draft);

test(
  "home lists the featured projects but the band's and closes on the rest; /projects lists every one",
  OPTIONS,
  async () => {
    const rows = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll("#projects li.row")].map((li) => li.id),
      );
    const closing = (page) =>
      page.evaluate(() =>
        [...document.querySelectorAll("#projects > .row")].map((row) => ({
          count: row.querySelector(".kind").textContent.trim(),
          line: row.querySelector(".desc").textContent.trim(),
          href: row.querySelector("a.go").getAttribute("href"),
        })),
      );
    const shown = PROJECTS.filter(
      (p) => p.featured && p.id !== featuredProject,
    );
    const hidden = PROJECTS.filter(
      (p) => !p.featured && p.id !== featuredProject,
    );
    const home = await open("/");
    try {
      assert.deepEqual(
        (await rows(home.page)).sort(),
        shown.map((p) => p.id).sort(),
      );
      const [row, ...extra] = await closing(home.page);
      assert.deepEqual(extra, [], "one closing row");
      assert.equal(row.count, `${hidden.length} more`);
      assert.equal(row.href, "/projects");
      // One line naming the kinds left out, and only those.
      const words = {
        product: /product/i,
        side: /side project/i,
        website: /website/i,
      };
      for (const [kind, word] of Object.entries(words)) {
        assert.equal(
          word.test(row.line),
          hidden.some((p) => p.kind === kind),
          `${kind} in "${row.line}"`,
        );
      }
    } finally {
      await home.context.close();
    }
    assert.deepEqual(home.problems, [], "home reported problems");

    const list = await open("/projects");
    try {
      assert.deepEqual(
        (await rows(list.page)).sort(),
        PROJECTS.map((p) => p.id).sort(),
      );
      assert.deepEqual(await closing(list.page), [], "no closing row");
    } finally {
      await list.context.close();
    }
    assert.deepEqual(list.problems, [], "/projects reported problems");
  },
);
