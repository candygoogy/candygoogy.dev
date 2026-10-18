// The fixes I've sent to other projects (src/data/site.ts), checked before
// About lists them: each one links a pull request on GitHub, never one in
// my own repositories. A bad entry stops the build. No imports, so the unit
// tests load it as it is.

export interface Fix {
  project: string;
  // The pull request: https://github.com/<owner>/<repo>/pull/<number>.
  url: string;
  // The day it was merged, e.g. "2026-10-07"; About shows the month.
  merged: string;
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
