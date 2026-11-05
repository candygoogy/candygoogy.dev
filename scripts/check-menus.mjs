// Checks the experiments' menu indexes (the featured projects in their
// phone menus) against the home page just built, for CI on pushes and pull
// requests. The daily check (scripts/check-live.mjs) compares them with the
// live home page, so a push that changes the featured list would deploy
// and only fail the next day. This fails the push instead, before release
// moves deploy: update the experiments' copies first, then the site.
//
// Drift fails. A tool that can't be fetched only warns, so an outage
// elsewhere doesn't block a deploy; the daily check fails on it, as
// DATA_STRICT fails only the scheduled run. Run after the build:
//   node scripts/check-menus.mjs
import { readFile } from "node:fs/promises";
import { checkIndexes, liveTools, report } from "./check-live.mjs";

// Astro's output for "/" (build.format "file").
const HOME = new URL("../dist/index.html", import.meta.url);

try {
  const home = await readFile(HOME, "utf8");
  report(
    "check-menus",
    checkIndexes(home, await liveTools(), { warnUnfetched: true }),
  );
} catch (error) {
  console.error(
    `check-menus: FAIL couldn't check the experiments' menus: ${error}`,
  );
  process.exitCode = 1;
}
