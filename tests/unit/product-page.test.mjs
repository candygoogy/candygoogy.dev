import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// The shared product page as the build wrote it: each product's own two
// headings and structured data, and Fettle's and idiff's wording left as
// it was. It reads dist/, so it runs after `npm run build`; without a
// build it's skipped.

const DIST = new URL("../../dist/", import.meta.url);
const skip =
  !existsSync(new URL("tellall.html", DIST)) && "no dist/: run `npm run build`";

const read = (page) => readFileSync(new URL(page, DIST), "utf8");

// From the first section heading to Privacy (the pair, or its own section
// when there's no What I learned): the part of the page the template
// writes (the header's project list is left out).
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
