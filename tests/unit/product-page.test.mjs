import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// The shared product page as the build wrote it: each product's own two
// headings and structured data, and Fettle's and idiff's wording left as
// it was; the band holding the product only, the story as a section of its
// own, and each fact said once. It reads dist/, so it runs after
// `npm run build`; without a build it's skipped.

const DIST = new URL("../../dist/", import.meta.url);
const skip =
  !existsSync(new URL("tellall.html", DIST)) && "no dist/: run `npm run build`";

const read = (page) => readFileSync(new URL(page, DIST), "utf8");

// From the checks' heading to Privacy: the part of the page the template
// writes from the product's sections (the header's project list is left
// out).
const sections = (html) => {
  const match =
    /id="checks-title"[\s\S]*?(?:aria-label="Privacy|aria-labelledby="privacy-title")/.exec(
      html,
    );
  assert.ok(match, "the page has its sections");
  return match[0];
};

const headings = (html) =>
  ["checks-title", "uses-title"].map((id) => {
    const match = new RegExp(
      `id="${id}"[^>]*>(?:\\s*<span[^>]*>)+([^<]*)<`,
    ).exec(html);
    assert.ok(match, `the page has #${id}`);
    return match[1].trim();
  });

// The band at the top of the page, and the closing panel at its end.
const band = (html) => {
  const match = /<section[^>]*class="band [^"]*"[\s\S]*?<\/section>/.exec(html);
  assert.ok(match, "the page has its band");
  return match[0];
};

const panel = (html) => {
  const match = /aria-labelledby="cta-title"[\s\S]*?<\/section>/.exec(html);
  assert.ok(match, "the page has its closing panel");
  return match[0];
};

const schema = (html) => {
  const match =
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "the page has structured data");
  return JSON.parse(match[1]);
};

test(
  "tellall.html: its own headings, no receipt, its systems",
  { skip },
  () => {
    const html = read("tellall.html");
    assert.deepEqual(headings(html), ["What it reads", "How you use it"]);
    const body = sections(html);
    assert.equal(/receipt/i.test(body), false);
    assert.equal(body.includes("What it checks"), false);
    const data = schema(html);
    assert.equal(data.operatingSystem, "Web browser, Node.js 20.19 or later");
    assert.equal(data.applicationCategory, "SecurityApplication");
  },
);

test("idiff.html: the headings and structured data as before", { skip }, () => {
  const html = read("idiff.html");
  assert.deepEqual(headings(html), [
    "What it checks",
    "What you can do with the receipt",
  ]);
  const data = schema(html);
  assert.equal(data.operatingSystem, "Windows 10, Windows 11");
  assert.equal(data.applicationCategory, "UtilitiesApplication");
});

test(
  "each product page: the story is a section of its own, after the band",
  { skip },
  () => {
    for (const page of ["fettle", "featherplay", "tellall", "idiff"]) {
      const html = read(`${page}.html`);
      const top = band(html);
      for (const part of ["Why", "What was hard", "What it won’t do"]) {
        assert.equal(
          top.includes(`>${part}<`),
          false,
          `${page}: ${part} in the band`,
        );
      }
      const why = html.indexOf('aria-labelledby="why-title"');
      assert.ok(why > html.indexOf(top), `${page}: Why follows the band`);
      assert.ok(
        why < html.indexOf('id="checks-title"'),
        `${page}: Why comes before the checks`,
      );
      const story = html.slice(why, html.indexOf("</section>", why));
      assert.ok(story.includes(">What was hard<"), `${page}: What was hard`);
      assert.ok(
        story.includes(">What it won’t do<"),
        `${page}: What it won’t do`,
      );
    }
  },
);

test(
  "each product page: the source and the version are said once, in the facts",
  { skip },
  () => {
    for (const page of ["fettle", "featherplay", "tellall", "idiff"]) {
      const html = read(`${page}.html`);
      const end = panel(html);
      assert.equal(
        end.includes("Source on GitHub"),
        false,
        `${page}: Source twice`,
      );
      assert.equal(/version/i.test(end), false, `${page}: the version twice`);
      // The panel's one link is its button; All projects and Next follow.
      const links = end.slice(0, end.indexOf('class="way')).match(/<a /g) ?? [];
      assert.equal(links.length, 1, `${page}: the panel has the button only`);
      const top = band(html);
      assert.equal(
        top.split("Source on GitHub").length - 1,
        1,
        `${page}: Source in the facts`,
      );
      assert.ok(/, version \d/.test(top), `${page}: the version in the facts`);
    }
  },
);

test(
  "a band without a picture is its head row only: no story column, no figure",
  { skip },
  () => {
    for (const page of ["tellall", "idiff"]) {
      const top = band(read(`${page}.html`));
      assert.equal(/class="zig/.test(top), false, `${page}: an empty column`);
      assert.equal(top.includes("<figure"), false, `${page}: a figure`);
      assert.ok(/<dl class="facts/.test(top), `${page}: the facts`);
    }
    // With a picture, the picture comes after the facts.
    const top = band(read("featherplay.html"));
    assert.ok(top.indexOf("<figure") > top.indexOf('<dl class="facts'));
  },
);
