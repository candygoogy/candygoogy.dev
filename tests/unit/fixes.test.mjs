import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fixes } from "../../src/data/site.ts";
import { checkFixes, groupFixes } from "../../src/lib/fixes.ts";

const fix = (url, merged = "2026-10-07") => ({
  project: "Example",
  url,
  merged,
  line: "A line.",
});

test("checkFixes passes the listed fixes, newest first", () => {
  const checked = checkFixes([...fixes].reverse());
  assert.equal(checked.length, fixes.length);
  for (let i = 1; i < checked.length; i++) {
    assert.ok(checked[i - 1].merged >= checked[i].merged);
  }
});

test("checkFixes stops on anything but a pull request on GitHub", () => {
  for (const url of [
    "https://github.com/pi-hole/pi-hole/issues/6711",
    "https://github.com/pi-hole/pi-hole/pull/6711/files",
    "https://github.com/pi-hole/pi-hole/pull/",
    "http://github.com/pi-hole/pi-hole/pull/6711",
    "https://gitlab.com/pi-hole/pi-hole/pull/6711",
    "https://github.com/pi-hole/pull/6711",
  ]) {
    assert.throws(() => checkFixes([fix(url)]), /isn't a pull request/, url);
  }
});

test("checkFixes stops on a fix in my own repositories", () => {
  for (const url of [
    "https://github.com/candygoogy/candygoogy.dev/pull/1",
    "https://github.com/fettle-page/fettle/pull/2",
    "https://github.com/Fettle-Page/idiff/pull/3",
  ]) {
    assert.throws(() => checkFixes([fix(url)]), /my own repositories/, url);
  }
});

test("checkFixes stops on a merge day that isn't one", () => {
  const url = "https://github.com/pypa/distlib/pull/269";
  for (const merged of ["Oct 2026", "2026-10", "2026-13-40"]) {
    assert.throws(() => checkFixes([fix(url, merged)]), /merged is/, merged);
  }
});

test("groupFixes groups by group, else project, newest group first", () => {
  const at = (project, merged, group) => ({
    ...fix(`https://github.com/x/${project}/pull/1`, merged),
    project,
    ...(group && { group }),
  });
  const groups = groupFixes([
    at("Core", "2026-10-01"),
    at("Web", "2026-10-20", "Core"),
    at("Other", "2026-10-10"),
    at("Web", "2026-11-01"),
    at("Core", "2026-10-15"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.name, g.fixes.map((f) => f.merged)]),
    [
      ["Web", ["2026-11-01"]],
      ["Core", ["2026-10-20", "2026-10-15", "2026-10-01"]],
      ["Other", ["2026-10-10"]],
    ],
  );
});

test("groupFixes keeps every listed fix, both Pi-hole repositories in one", () => {
  const groups = groupFixes(checkFixes(fixes));
  assert.equal(
    groups.reduce((n, g) => n + g.fixes.length, 0),
    fixes.length,
  );
  const pihole = groups.find((g) => g.name === "Pi-hole");
  assert.deepEqual(pihole?.fixes.map((f) => f.project).sort(), [
    "Pi-hole",
    "Pi-hole web interface",
  ]);
});

// The pages as the build wrote them: /fixes lists every fix under its
// group, About the newest two and a link to the rest. These read dist/, so they run after
// `npm run build`; without a build they're skipped.
const DIST = new URL("../../dist/", import.meta.url);
const skip =
  !existsSync(new URL("index.html", DIST)) && "no dist/: run `npm run build`";
// Each list's pull requests in order, one link per fix.
const listed = (html) =>
  [...html.matchAll(/<ol class="fix-list"[^>]*>([\s\S]*?)<\/ol>/g)].map((m) =>
    [...m[1].matchAll(/<a\b[^>]*?\bhref="([^"]+)"/g)].map((a) => a[1]),
  );
const page = (file) => readFileSync(new URL(file, DIST), "utf8");

test("fixes.html lists every fix, one list per group", { skip }, () => {
  assert.deepEqual(
    listed(page("fixes.html")),
    groupFixes(checkFixes(fixes)).map((g) => g.fixes.map((f) => f.url)),
  );
});

test(
  "About lists the newest two fixes and links to all of them",
  { skip },
  () => {
    const html = page("index.html");
    assert.deepEqual(listed(html), [
      checkFixes(fixes)
        .slice(0, 2)
        .map((f) => f.url),
    ]);
    const link = /<a href="\/fixes"[^>]*>([\s\S]*?)<\/a>/.exec(
      html.slice(html.indexOf('class="fixes"')),
    )?.[1];
    assert.equal(
      link?.replace(/\s+/g, " ").trim(),
      `All ${fixes.length} fixes`,
    );
  },
);
