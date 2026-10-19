// src/lib/github.ts reads src/data/*.json relative to the working
// directory: run from the repository root.
import assert from "node:assert/strict";
import test from "node:test";
import {
  frontmatterKey,
  httpError,
  mergeData,
  parseContributions,
  productRepo,
  staleDeploy,
  staleReleases,
  validDays,
} from "../../scripts/github-days.mjs";
import {
  higherVersion,
  isRelease,
  latestVersion,
} from "../../src/lib/github.ts";

test("higherVersion compares dotted versions as numbers", () => {
  assert.equal(higherVersion("1.0.3", "1.0.2"), "1.0.3");
  assert.equal(higherVersion("1.0.2", "1.0.3"), "1.0.3");
  assert.equal(higherVersion("1.10.0", "1.9.9"), "1.10.0");
  // Equal versions keep the first.
  assert.equal(higherVersion("v1.2", "1.2.0"), "v1.2");
  assert.equal(higherVersion("1.2.0", "v1.2"), "1.2.0");
});

test("higherVersion: a final release beats its pre-releases", () => {
  assert.equal(higherVersion("1.1.0-rc.1", "1.1.0"), "1.1.0");
  assert.equal(higherVersion("1.1.0", "1.1.0-rc.1"), "1.1.0");
  assert.equal(higherVersion("v1.1.0-beta", "1.1.0"), "1.1.0");
  assert.equal(higherVersion("1.1.0", "v1.1.0-beta"), "1.1.0");
  // A pre-release of a later version still beats an earlier final.
  assert.equal(higherVersion("1.1.0-rc.1", "1.0.9"), "1.1.0-rc.1");
});

test("higherVersion orders pre-releases by semver precedence", () => {
  assert.equal(higherVersion("1.1.0-rc.2", "1.1.0-rc.10"), "1.1.0-rc.10");
  assert.equal(higherVersion("1.1.0-beta", "1.1.0-rc.1"), "1.1.0-rc.1");
  assert.equal(higherVersion("1.1.0-alpha", "1.1.0-alpha.1"), "1.1.0-alpha.1");
  // Numeric identifiers sit below words.
  assert.equal(higherVersion("1.1.0-1", "1.1.0-alpha"), "1.1.0-alpha");
  // Build metadata doesn't count: equal, so the first is kept.
  assert.equal(higherVersion("1.1.0+abc", "1.1.0"), "1.1.0+abc");
});

test("higherVersion: junk doesn't throw", () => {
  assert.doesNotThrow(() => higherVersion("next", "1.0.0"));
  assert.equal(higherVersion("next", "1.0.0"), "1.0.0");
  assert.equal(higherVersion("1.x.0", "1.0.1"), "1.0.1");
  assert.doesNotThrow(() => higherVersion("1.0.0-", "1.0.0-..x"));
});

test("higherVersion: a missing side loses", () => {
  assert.equal(higherVersion(undefined, "1.0.0"), "1.0.0");
  assert.equal(higherVersion("1.0.0", undefined), "1.0.0");
  assert.equal(higherVersion(undefined, undefined), undefined);
});

test("isRelease: a release whose date doesn't parse is dropped", () => {
  const release = {
    tag: "v1.0.0",
    name: "1.0.0",
    url: "https://github.com/a/b/releases/tag/v1.0.0",
    published: "2026-10-16T22:00:00Z",
  };
  assert.ok(isRelease(release));
  assert.ok(!isRelease({ ...release, published: "" }));
  assert.ok(!isRelease({ ...release, published: "soon" }));
});

test("latestVersion: a newer frontmatter version beats the fetched one", () => {
  // Fixed versions, so the result doesn't depend on the local data file.
  const versions = { "someone/thing": "1.0.5" };
  assert.equal(latestVersion("someone/thing", "0.0.1", versions), "1.0.5");
  assert.equal(latestVersion("someone/thing", "999.0.0", versions), "999.0.0");
  assert.equal(latestVersion("nobody/nothing", "1.2.3", versions), "1.2.3");
  assert.equal(latestVersion(undefined, "1.2.3", versions), "1.2.3");
});

test("frontmatterKey reads plain and quoted values", () => {
  const front = 'kind: product\nrepo: "fettle-page/idiff"\nname: Two words';
  assert.equal(frontmatterKey(front, "kind"), "product");
  assert.equal(frontmatterKey(front, "repo"), "fettle-page/idiff");
  // A value with spaces isn't one word: not read.
  assert.equal(frontmatterKey(front, "name"), undefined);
  assert.equal(frontmatterKey(front, "version"), undefined);
});

test("frontmatterKey allows a trailing comment", () => {
  const front = "kind: product # shown\r\nrepo: 'fettle-page/idiff'  # cli";
  assert.equal(frontmatterKey(front, "kind"), "product");
  assert.equal(frontmatterKey(front, "repo"), "fettle-page/idiff");
  // Without a space before it, "#" isn't a comment, so the value isn't read.
  assert.equal(frontmatterKey("repo: a/b#c", "repo"), undefined);
  // Indented keys belong to something else.
  assert.equal(frontmatterKey("links:\n  repo: a/b", "repo"), undefined);
});

test("productRepo skips side projects and drafts", () => {
  assert.equal(productRepo("---\nkind: product\nrepo: a/b\n---"), "a/b");
  assert.equal(productRepo("---\nkind: side\nrepo: a/b\n---"), undefined);
  assert.equal(
    productRepo("---\nkind: product\nrepo: a/b\ndraft: true\n---"),
    undefined,
  );
  assert.equal(
    productRepo("---\nkind: product\nrepo: a/b\ndraft: false\n---"),
    "a/b",
  );
});

// Shaped like GitHub's logged-out calendar: <td> cells with an id, date and
// level, and the counts in <tool-tip>s that point at a cell's id.
const CALENDAR = `
<table class="ContributionCalendar-grid js-calendar-graph-table" role="grid">
  <tbody>
    <tr style="height: 10px">
      <td class="ContributionCalendar-label"><span class="sr-only">Sunday</span></td>
      <td tabindex="0" data-ix="0" style="width: 10px" data-date="2025-10-12" id="contribution-day-component-0-0" data-level="0" role="gridcell" data-view-component="true" class="ContributionCalendar-day"></td>
      <td tabindex="-1" data-ix="1" style="width: 10px" data-date="2025-10-19" id="contribution-day-component-0-1" data-level="1" role="gridcell" data-view-component="true" class="ContributionCalendar-day"></td>
    </tr>
    <tr style="height: 10px">
      <td class="ContributionCalendar-label"><span class="sr-only">Monday</span></td>
      <td tabindex="-1" data-ix="0" style="width: 10px" data-date="2025-10-13" id="contribution-day-component-1-0" data-level="4" role="gridcell" data-view-component="true" class="ContributionCalendar-day"></td>
      <td tabindex="-1" data-ix="1" style="width: 10px" data-date="2025-10-20" id="contribution-day-component-1-1" data-level="2" role="gridcell" data-view-component="true" class="ContributionCalendar-day"></td>
    </tr>
  </tbody>
</table>
<tool-tip id="tooltip-1" for="contribution-day-component-0-0" popover="manual" data-direction="n" data-type="label" class="sr-only position-absolute">No contributions on October 12th.</tool-tip>
<tool-tip id="tooltip-2" for="contribution-day-component-0-1" popover="manual" data-direction="n" data-type="label" class="sr-only position-absolute">1 contribution on October 19th.</tool-tip>
<tool-tip id="tooltip-3" for="contribution-day-component-1-0" popover="manual" data-direction="n" data-type="label" class="sr-only position-absolute">1,234 contributions on October 13th.</tool-tip>
<tool-tip id="tooltip-4" for="contribution-day-component-1-1" popover="manual" data-direction="n" data-type="label" class="sr-only position-absolute">
  7 contributions on October 20th.
</tool-tip>
<tool-tip id="tooltip-5" for="contribution-day-component-9-9" popover="manual" data-direction="n" data-type="label" class="sr-only position-absolute">5 contributions on a day with no cell.</tool-tip>
`;

test("parseContributions reads dates, levels and tooltip counts", () => {
  assert.deepEqual(parseContributions(CALENDAR), [
    { date: "2025-10-12", count: 0, level: 0 },
    { date: "2025-10-19", count: 1, level: 1 },
    { date: "2025-10-13", count: 1234, level: 4 },
    { date: "2025-10-20", count: 7, level: 2 },
  ]);
});

test("parseContributions: a page without the calendar gives no days", () => {
  assert.deepEqual(
    parseContributions("<html><body>Not found</body></html>"),
    [],
  );
});

// A year of days from 2025-01-01, in reverse order.
function year(day = () => ({ count: 1, level: 1 })) {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: 365 }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    ...day(i),
  })).reverse();
}

test("validDays: fewer than 300 days throws", () => {
  assert.throws(() => validDays(year().slice(0, 299)), /only 299 days/);
});

test("validDays: a bad level throws", () => {
  const days = year();
  days[10].level = 5;
  assert.throws(() => validDays(days), /bad level/);
});

test("validDays: levels without counts throw", () => {
  assert.throws(
    () => validDays(year(() => ({ count: 0, level: 2 }))),
    /levels without counts/,
  );
});

test("validDays: a normal year passes, sorted by date", () => {
  const days = validDays(year((i) => ({ count: i % 3, level: i % 3 ? 1 : 0 })));
  assert.equal(days.length, 365);
  assert.equal(days[0].date, "2025-01-01");
  assert.equal(days.at(-1).date, "2025-12-31");
  for (let i = 1; i < days.length; i++) {
    assert.ok(days[i - 1].date < days[i].date);
  }
});

test("validDays: a quiet year (all zero) passes", () => {
  const days = validDays(year(() => ({ count: 0, level: 0 })));
  assert.equal(days.length, 365);
});

test("validDays: a missing or repeated day throws", () => {
  const gap = year();
  gap.splice(100, 1);
  assert.throws(() => validDays(gap), /days not consecutive/);
  const repeat = year();
  repeat[100] = { ...repeat[101] };
  assert.throws(() => validDays(repeat), /days not consecutive/);
});

const OLD = {
  fetchedAt: "2026-10-01T05:17:00.000Z",
  versions: { "a/kept": "1.0.0", "a/removed": "2.0.0" },
  releases: { "a/kept": [{ tag: "v1.0.0" }], "a/removed": [{ tag: "v2" }] },
  contributions: { source: "profile", days: [] },
};
const NOW = "2026-10-16T05:17:00.000Z";

test("mergeData: a failed part keeps its old value, fetchedAt stays", () => {
  const data = mergeData(
    OLD,
    { repos: ["a/kept"], versions: {}, releases: {}, contributions: null },
    NOW,
  );
  assert.deepEqual(data, {
    fetchedAt: OLD.fetchedAt,
    // A product no longer listed loses its version and releases.
    versions: { "a/kept": "1.0.0" },
    releases: { "a/kept": OLD.releases["a/kept"] },
    contributions: OLD.contributions,
  });
});

test("mergeData: fetchedAt moves only when every part fetched", () => {
  const contributions = { source: "profile", days: [{ date: "x" }] };
  const releases = { "a/kept": [{ tag: "v1.1.0" }] };
  const full = mergeData(
    OLD,
    {
      repos: ["a/kept"],
      versions: { "a/kept": "1.1.0" },
      releases,
      contributions,
    },
    NOW,
  );
  assert.deepEqual(full, {
    fetchedAt: NOW,
    versions: { "a/kept": "1.1.0" },
    releases,
    contributions,
  });
  // A release list that didn't fetch keeps its old one, and fetchedAt.
  const noList = mergeData(
    OLD,
    {
      repos: ["a/kept"],
      versions: { "a/kept": "1.1.0" },
      releases: {},
      contributions,
    },
    NOW,
  );
  assert.equal(noList.fetchedAt, OLD.fetchedAt);
  assert.deepEqual(noList.releases, { "a/kept": OLD.releases["a/kept"] });
  // Without a project list, all old versions are kept and nothing is fresh.
  const noRepos = mergeData(
    OLD,
    { repos: null, versions: {}, releases: {}, contributions },
    NOW,
  );
  assert.equal(noRepos.fetchedAt, OLD.fetchedAt);
  assert.deepEqual(noRepos.versions, OLD.versions);
  assert.deepEqual(noRepos.releases, OLD.releases);
  // Data from before release lists keeps working.
  const older = { ...OLD, releases: undefined };
  assert.deepEqual(
    mergeData(
      older,
      { repos: ["a/kept"], versions: {}, releases: {}, contributions: null },
      NOW,
    ).releases,
    {},
  );
});

// Kept days whose newest is the given date.
const keptUntil = (date) => ({ source: "profile", days: [{ date }] });
const TODAY = new Date("2026-10-16T12:00:00Z");

test("staleDeploy: Workers Builds with old or no kept days fails", () => {
  const stale = { fetched: false, workersBuilds: true, now: TODAY };
  assert.equal(
    staleDeploy({ ...stale, contributions: keptUntil("2026-10-08") }),
    true,
  );
  assert.equal(staleDeploy({ ...stale, contributions: null }), true);
});

test("staleDeploy: recent days, a fetch or a local build passes", () => {
  const old = keptUntil("2026-10-08");
  assert.equal(
    staleDeploy({
      fetched: false,
      workersBuilds: true,
      contributions: keptUntil("2026-10-09"),
      now: TODAY,
    }),
    false,
  );
  assert.equal(
    staleDeploy({
      fetched: false,
      workersBuilds: false,
      contributions: old,
      now: TODAY,
    }),
    false,
  );
  assert.equal(
    staleDeploy({
      fetched: true,
      workersBuilds: true,
      contributions: old,
      now: TODAY,
    }),
    false,
  );
});

test("staleReleases: on Workers Builds any release part that didn't fetch fails", () => {
  const repos = ["a/b", "c/d"];
  const all = { "a/b": 1, "c/d": 1 };
  const run = { workersBuilds: true, repos, versions: all, releases: all };
  assert.equal(staleReleases({ ...run, repos: null }), true);
  assert.equal(staleReleases({ ...run, versions: { "a/b": 1 } }), true);
  assert.equal(staleReleases({ ...run, releases: { "c/d": 1 } }), true);
});

test("staleReleases: everything fetched, or a local build, passes", () => {
  const all = { "a/b": 1 };
  const run = { repos: ["a/b"], versions: all, releases: all };
  assert.equal(staleReleases({ ...run, workersBuilds: true }), false);
  assert.equal(
    staleReleases({
      workersBuilds: false,
      repos: null,
      versions: {},
      releases: {},
    }),
    false,
  );
});

test("productRepo reads draft as YAML does: True and TRUE are drafts too", () => {
  for (const draft of ["True", "TRUE"]) {
    assert.equal(
      productRepo(`---\nkind: product\nrepo: a/b\ndraft: ${draft}\n---`),
      undefined,
      draft,
    );
  }
});

test("httpError: GitHub's API rate limit names itself and the token", () => {
  const api = "https://api.github.com/repos/a/b/releases/latest";
  const limited =
    /HTTP (403|429), GitHub's rate limit: a GITHUB_TOKEN build variable avoids it$/;
  for (const [status, headers] of [
    [403, { "x-ratelimit-remaining": "0" }],
    [429, { "x-ratelimit-remaining": "0" }],
    [403, { "retry-after": "60" }],
    [429, { "retry-after": "60" }],
  ]) {
    assert.match(
      httpError(api, status, new Headers(headers), false),
      limited,
      `${status} ${JSON.stringify(headers)}`,
    );
  }
  assert.match(
    httpError(api, 403, new Headers({ "x-ratelimit-remaining": "0" }), true),
    /rate limit: the GITHUB_TOKEN's is used up too$/,
  );
  // A 403 with requests left is a refusal, and the profile page takes no
  // token: both stay plain.
  assert.equal(
    httpError(api, 403, new Headers({ "x-ratelimit-remaining": "42" }), false),
    `${api}: HTTP 403`,
  );
  const profile = "https://github.com/users/candygoogy/contributions";
  assert.equal(
    httpError(profile, 429, new Headers({ "retry-after": "60" }), false),
    `${profile}: HTTP 429`,
  );
});
