import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { parseFeed } from "./map-feed.ts";

// /map.json, the map's content feed (src/lib/map-feed.ts), as the build
// wrote it, checked with the map's own parseFeed (copied in map-feed.ts).
// It reads dist/, so it runs after `npm run build`; without a built feed
// (a fresh checkout, or build:deploy, which tests before it builds) it's
// skipped.

const ROOT = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
const FEED = new URL("dist/map.json", ROOT);
const skip = !existsSync(FEED) && "no dist/map.json: run `npm run build`";
const raw = () => readFileSync(FEED, "utf8");

// The published entries of a content collection, by id: not drafts, and
// for experiments not retired.
const published = (dir) =>
  readdirSync(new URL(`src/content/${dir}/`, ROOT))
    .filter((name) => name.endsWith(".md"))
    .filter((name) => {
      const front =
        /^---\r?\n([\s\S]*?)\r?\n---/.exec(
          read(`src/content/${dir}/${name}`),
        )?.[1] ?? "";
      return (
        !/^draft:\s*true\s*$/m.test(front) &&
        !/^status:\s*retired\s*$/m.test(front)
      );
    })
    .map((name) => name.slice(0, -".md".length));

test("dist/map.json passes the map's parseFeed", { skip }, () => {
  const feed = parseFeed(JSON.parse(raw()));
  assert.equal(feed.version, 1);
  assert.ok(!Number.isNaN(Date.parse(feed.generated)), "generated is a date");
});

test("every project and every experiment is in dist/map.json", { skip }, () => {
  const { nodes } = JSON.parse(raw());
  const projects = nodes.filter((n) => n.kind === "project").map((n) => n.id);
  assert.deepEqual(projects.toSorted(), published("projects").toSorted());
  const children = nodes.find((n) => n.kind === "experiments")?.children ?? [];
  assert.deepEqual(
    children.map((c) => c.id).toSorted(),
    published("experiments").toSorted(),
  );
});

test("dist/map.json has no undefined, null or empty string", { skip }, () => {
  // JSON has no undefined of its own: a value stringified by mistake
  // ("undefined", "null") is caught as a string.
  const walk = (v, at) => {
    assert.notEqual(v, null, `${at} is null`);
    if (typeof v === "string") {
      assert.notEqual(v.trim(), "", `${at} is empty`);
      assert.ok(!["undefined", "null"].includes(v), `${at} is "${v}"`);
    }
    if (typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  walk(JSON.parse(raw()), "feed");
});
