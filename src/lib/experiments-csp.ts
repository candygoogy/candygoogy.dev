import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { oldestCheck } from "../../scripts/experiments-policy.mjs";
import { root } from "./github";

// What each experiment's live security policy lets it connect to, as
// checked at build time (scripts/experiments-csp.mjs), or the committed
// snapshot when a build ran without it. Build time only.

interface Check {
  connect: string[];
  checked: string;
}

const valid = (v: unknown): v is Check =>
  !!v &&
  typeof v === "object" &&
  Array.isArray((v as Check).connect) &&
  (v as Check).connect.every((s) => typeof s === "string") &&
  typeof (v as Check).checked === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test((v as Check).checked);

// A file that doesn't parse falls through to the next; an entry of the
// wrong shape is left out (it counts as unchecked).
function load(): Record<string, Check> {
  for (const name of [
    "experiments-csp.json",
    "experiments-csp.snapshot.json",
  ]) {
    const file = `src/data/${name}`;
    const path = join(root, file);
    if (!existsSync(path)) continue;
    try {
      const data: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        console.warn(
          `experiments-csp: WARNING ignoring ${file}: not an object`,
        );
        continue;
      }
      return Object.fromEntries(
        Object.entries(data).filter(([, v]) => valid(v)),
      );
    } catch (error) {
      console.warn(
        `experiments-csp: WARNING ignoring unreadable ${file}: ${error}`,
      );
    }
  }
  return {};
}

const checks = load();

// "Oct 16", as the heatmap writes a day; with the year when it isn't this
// year's.
const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const thisYear = new Date().getUTCFullYear();
function label(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const year = date.getUTCFullYear();
  return day.format(date) + (year === thisYear ? "" : `, ${year}`);
}

/** The day of the oldest check across the listed tools ("Oct 16"), for the
 * lede; undefined when any tool is unchecked or allows more than the lede
 * says, or mail isn't listed (the build warns, and the lede leaves the
 * policies out). */
export function policyChecked(ids: string[]): string | undefined {
  const { checked, failing } = oldestCheck(ids, checks);
  if (failing.length) {
    console.warn(
      `experiments-csp: WARNING ${failing.join(", ")} unchecked, unlisted or allowing more than described: no policy sentences in the lede`,
    );
  }
  return checked && label(checked);
}
