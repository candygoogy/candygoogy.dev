import assert from "node:assert/strict";
import test from "node:test";
import { atom, newestFirst, rfc3339 } from "../../src/lib/feed.ts";
import { parseReleases } from "../../scripts/github-days.mjs";

const entry = (title, updated) => ({
  title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  updated,
  summary: `About ${title}.`,
});

test("newestFirst: newest first, ties by title, at most 30", () => {
  const entries = [
    entry("b", "2026-10-15T00:00:00Z"),
    entry("a", "2026-10-15T00:00:00Z"),
    entry("new", "2026-10-15T19:16:03Z"),
    entry("old", "2026-10-10T17:13:16Z"),
  ];
  assert.deepEqual(
    newestFirst(entries).map((e) => e.title),
    ["new", "a", "b", "old"],
  );
  const many = Array.from({ length: 40 }, (_, i) =>
    entry(`e${i}`, rfc3339(new Date(Date.UTC(2026, 0, 1 + i)))),
  );
  const kept = newestFirst(many);
  assert.equal(kept.length, 30);
  assert.equal(kept[0].title, "e39");
  assert.equal(kept.at(-1).title, "e10");
});

test("atom: updated is the newest entry's, and text is escaped", () => {
  const xml = atom({
    title: "candygoogy",
    site: "https://candygoogy.dev/",
    self: "https://candygoogy.dev/feed.xml",
    author: "candygoogy",
    entries: [
      entry("Fettle 1.0.4", "2026-10-13T03:37:46Z"),
      { ...entry("New experiment: A & <B>", "2026-10-15T00:00:00Z") },
    ],
  });
  assert.match(
    xml,
    /^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/,
  );
  assert.equal(
    /<feed[\s\S]*?<updated>([^<]*)<\/updated>/.exec(xml)?.[1],
    "2026-10-15T00:00:00Z",
  );
  assert.ok(xml.includes("<title>New experiment: A &amp; &lt;B&gt;</title>"));
  assert.ok(
    xml.indexOf("New experiment: A") < xml.indexOf("Fettle 1.0.4"),
    "newest entry first",
  );
  assert.throws(() =>
    atom({ title: "", site: "", self: "", author: "", entries: [] }),
  );
});

test("rfc3339 drops milliseconds", () => {
  assert.equal(
    rfc3339(new Date("2026-10-15T00:00:00.000Z")),
    "2026-10-15T00:00:00Z",
  );
});

test("parseReleases: published only, newest first, at most 10", () => {
  const release = (tag, published, extra = {}) => ({
    tag_name: tag,
    name: `Fettle ${tag}`,
    html_url: `https://github.com/fettle-page/fettle/releases/tag/${tag}`,
    published_at: published,
    body: "notes are dropped",
    ...extra,
  });
  const list = [
    release("v1.0.4", "2026-10-13T03:37:46Z"),
    release("v1.0.5", "2026-10-15T19:16:03Z"),
    release("v1.1.0-rc.1", "2026-10-16T00:00:00Z", { prerelease: true }),
    release("v1.2.0", null, { draft: true }),
  ];
  assert.deepEqual(parseReleases(list), [
    {
      tag: "v1.0.5",
      name: "Fettle v1.0.5",
      url: "https://github.com/fettle-page/fettle/releases/tag/v1.0.5",
      published: "2026-10-15T19:16:03Z",
    },
    {
      tag: "v1.0.4",
      name: "Fettle v1.0.4",
      url: "https://github.com/fettle-page/fettle/releases/tag/v1.0.4",
      published: "2026-10-13T03:37:46Z",
    },
  ]);
  const many = Array.from({ length: 12 }, (_, i) =>
    release(`v1.0.${i}`, `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
  );
  assert.equal(parseReleases(many).length, 10);
  assert.equal(parseReleases(many)[0].tag, "v1.0.11");
  // Another shape throws, so the last good list is kept.
  assert.throws(() => parseReleases({ message: "rate limited" }));
  assert.throws(() => parseReleases([release("v1", "not a date")]));
});
