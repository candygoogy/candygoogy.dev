// The pure parts of github-data.mjs: the frontmatter read, the contribution
// calendar parse and check, the release list read, the merge with the last
// good data and the stale deploy check. Kept apart from github-data.mjs (which fetches as soon as it
// is imported) so the tests can load them on their own.

const DAY = 86_400_000;

// A Markdown file's frontmatter block, or "" without one.
export const frontmatter = (text) =>
  /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";

// A top-level frontmatter key's value: one word without quotes, spaces or
// "#", optionally quoted, optionally followed by a "# comment". Anything
// else (lists, indented keys, values with spaces) reads as undefined.
export function frontmatterKey(front, name) {
  return new RegExp(
    `^${name}:[ \\t]*["']?([^"'\\s#]+)["']?(?:[ \\t]+#.*)?[ \\t]*\\r?$`,
    "m",
  ).exec(front)?.[1];
}

// A project file's repo if it is a product and not a draft (the site leaves
// drafts out too), else undefined.
export function productRepo(text) {
  const front = frontmatter(text);
  if (frontmatterKey(front, "kind") !== "product") return undefined;
  if (frontmatterKey(front, "draft") === "true") return undefined;
  return frontmatterKey(front, "repo");
}

// Reads the days out of the logged-out calendar page. Each day is a <td>
// cell with its date and level; the count is only in the tooltip that points
// at the cell's id, so a day with no matching tooltip keeps a count of 0.
export function parseContributions(html) {
  const cells = new Map();
  for (const [, attrs] of html.matchAll(
    /<td\b([^>]*\bContributionCalendar-day\b[^>]*)>/g,
  )) {
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const date = /\bdata-date="(\d{4}-\d{2}-\d{2})"/.exec(attrs)?.[1];
    const level = Number(/\bdata-level="(\d)"/.exec(attrs)?.[1]);
    if (id && date) cells.set(id, { date, count: 0, level });
  }
  for (const [, id, text] of html.matchAll(
    /<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g,
  )) {
    const cell = cells.get(id);
    const n = /^([\d,]+) contributions? on/.exec(text.trim())?.[1];
    if (cell && n) cell.count = Number(n.replaceAll(",", ""));
  }
  return [...cells.values()];
}

export function validDays(days) {
  if (days.length < 300) throw new Error(`only ${days.length} days`);
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error("bad date");
    if (!Number.isInteger(d.count) || d.count < 0) throw new Error("bad count");
    if (!Number.isInteger(d.level) || d.level < 0 || d.level > 4)
      throw new Error("bad level");
  }
  // Counts are parsed from tooltip wording. If GitHub rewords it, every count
  // reads 0 while the levels still show activity, so treat that as a failure.
  if (days.some((d) => d.level > 0) && days.every((d) => d.count === 0))
    throw new Error("levels without counts (tooltip wording changed?)");
  days.sort((a, b) => a.date.localeCompare(b.date));
  // The heatmap lays the days out in weeks, so a missing or repeated day
  // would shift every day after it.
  for (let i = 1; i < days.length; i++) {
    if (Date.parse(days[i].date) - Date.parse(days[i - 1].date) !== DAY)
      throw new Error(`days not consecutive at ${days[i].date}`);
  }
  return days;
}

// A repo's published releases, newest first, from the API's release list:
// each one's tag, name, page and publish time (no notes: the feed shows
// none). Drafts and pre-releases are left out, as releases/latest leaves
// them out of the version the site shows. Throws on a reply of another
// shape, so the last good list is kept.
export function parseReleases(list, max = 10) {
  if (!Array.isArray(list)) throw new Error("releases: not a list");
  const releases = [];
  for (const r of list) {
    if (!r || typeof r !== "object") throw new Error("releases: not a release");
    if (r.draft || r.prerelease) continue;
    const { tag_name: tag, html_url: url, published_at: published } = r;
    if (typeof tag !== "string" || !tag) throw new Error("releases: no tag");
    if (typeof url !== "string" || !url.startsWith("https://github.com/"))
      throw new Error(`releases: ${tag} has no GitHub page`);
    if (typeof published !== "string" || Number.isNaN(Date.parse(published)))
      throw new Error(`releases: ${tag} has no publish time`);
    releases.push({
      tag,
      name: typeof r.name === "string" ? r.name : "",
      url,
      published,
    });
  }
  return releases
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .slice(0, max);
}

// The old entries for repos still listed as products (so a removed
// product's don't stay forever), then this run's. Without a list, all the
// old ones are kept.
function byRepo(old, fresh, repos) {
  const kept = old ?? {};
  return {
    ...(repos
      ? Object.fromEntries(
          repos
            .filter((repo) => Object.hasOwn(kept, repo))
            .map((repo) => [repo, kept[repo]]),
        )
      : kept),
    ...fresh,
  };
}

// Merges this run's parts into the last good data. repos is null when the
// project list couldn't be read, versions and releases hold only the repos
// whose latest release and release list fetched, contributions is null when
// the calendar didn't.
export function mergeData(
  old,
  { repos, versions, releases, contributions },
  now,
) {
  const complete =
    repos !== null &&
    repos.every(
      (repo) => Object.hasOwn(versions, repo) && Object.hasOwn(releases, repo),
    ) &&
    contributions !== null;
  return {
    // Moves only when every part fetched, so it says how old the oldest part
    // of the data is.
    fetchedAt: complete ? now : (old.fetchedAt ?? ""),
    versions: byRepo(old.versions, versions, repos),
    releases: byRepo(old.releases, releases, repos),
    contributions: contributions ?? old.contributions ?? null,
  };
}

// Workers Builds starts from a clean clone, so when the calendar fetch fails
// there the kept days come from the committed snapshot, which ages. Past a
// week behind, failing the deploy beats shipping a heatmap that stopped.
export function staleDeploy({ fetched, workersBuilds, contributions, now }) {
  if (fetched || !workersBuilds) return false;
  // Days are stored sorted, so the last is the newest.
  const newest = Date.parse(contributions?.days?.at?.(-1)?.date);
  const today = Math.floor(now.getTime() / DAY) * DAY;
  // Missing or unreadable days count as stale too.
  return !(today - newest <= 7 * DAY);
}
