// The fixes I've sent to other projects (src/data/site.ts), checked before
// About lists them: each one links a pull request on GitHub, never one in
// my own repositories. A bad entry stops the build. No imports, so the unit
// tests load it as it is.

export interface Fix {
  project: string;
  // The heading /fixes lists it under, when that isn't the project: e.g.
  // "Pi-hole", so the web interface's fixes join the core's. Left out, it
  // is the project.
  group?: string;
  // The pull request: https://github.com/<owner>/<repo>/pull/<number>.
  url: string;
  // The day it was merged, e.g. "2026-10-07"; About shows the month.
  merged: string;
  // The project's first release with the fix in it, e.g. "v6.5"; left
  // out until there is one.
  release?: string;
  line: string;
}

// My own accounts: a fix there isn't a fix to someone else's project.
export const OWN = ["candygoogy", "fettle-page"];

const PULL = /^https:\/\/github\.com\/([\w.-]+)\/[\w.-]+\/pull\/[1-9]\d*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The fixes, newest first; throws on the first one that isn't a pull
// request on someone else's project, or has no merge day.
export function checkFixes(fixes: Fix[]): Fix[] {
  for (const fix of fixes) {
    const owner = PULL.exec(fix.url)?.[1];
    if (!owner) {
      throw new Error(
        `Fix "${fix.project}": ${fix.url} isn't a pull request on GitHub (https://github.com/<owner>/<repo>/pull/<number>).`,
      );
    }
    if (OWN.includes(owner.toLowerCase())) {
      throw new Error(
        `Fix "${fix.project}": ${fix.url} is in my own repositories; only fixes to other people's projects are listed.`,
      );
    }
    if (!DAY.test(fix.merged) || Number.isNaN(Date.parse(fix.merged))) {
      throw new Error(
        `Fix "${fix.project}": merged is "${fix.merged}", not a day like 2026-10-07.`,
      );
    }
  }
  return [...fixes].sort((a, b) => b.merged.localeCompare(a.merged));
}

// One heading's fixes on /fixes.
export interface FixGroup {
  name: string;
  fixes: Fix[];
}

// The fixes under their headings (a fix's group, or its project), for
// /fixes: each heading's fixes newest first, and the heading with the
// newest fix first.
export function groupFixes(fixes: Fix[]): FixGroup[] {
  const groups = new Map<string, Fix[]>();
  const newest = [...fixes].sort((a, b) => b.merged.localeCompare(a.merged));
  for (const fix of newest) {
    const name = fix.group ?? fix.project;
    groups.set(name, [...(groups.get(name) ?? []), fix]);
  }
  return [...groups].map(([name, fixes]) => ({ name, fixes }));
}
