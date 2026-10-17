// Checks what each experiment's live security policy lets it connect to and
// load from, at build time, for the lede on /experiments: a HEAD request to
// each listed tool (livePolicies), its Content-Security-Policy read and
// written to src/data/experiments-csp.json as
// { [id]: { connect: [sources], elsewhere: [what else gets out],
//   checked: "YYYY-MM-DD" } }.
//
// No token: the tools are public pages. It never fails the build. A tool
// that doesn't answer keeps its last good check (from the last run's file,
// or the committed src/data/experiments-csp.snapshot.json), with its old
// date. A tool with no check, or a policy looser than the lede says
// (scripts/experiments-policy.mjs), leaves the policies out of the lede and
// warns; that policy is written as it is. The daily CI run fails loudly on
// that instead (scripts/check-live.mjs). With DATA_STRICT=1 (that run's data step) it
// still writes the file, then exits with code 1 if there was any warning,
// like the other data scripts.
//   node scripts/experiments-csp.mjs [--snapshot]

import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  allows,
  classify,
  livePolicies,
  mergeChecks,
  policyOf,
} from "./experiments-policy.mjs";

const DATA = join(import.meta.dirname, "..", "src", "data");
const OUT = join(DATA, "experiments-csp.json");
const SNAPSHOT = join(DATA, "experiments-csp.snapshot.json");
const STRICT = process.env.DATA_STRICT === "1";

let warnings = 0;
function warn(message) {
  warnings++;
  console.warn(`experiments-csp: WARNING ${message}`);
}

async function previous() {
  for (const file of [OUT, SNAPSHOT]) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return data;
      }
      warn(`ignoring ${file}: not an object`);
    } catch (error) {
      warn(`ignoring unreadable ${file}: ${error}`);
    }
  }
  return {};
}

// Each list of sources on one line where it fits, as Prettier writes it
// (the snapshot is committed). Written aside and renamed, so a cut-off
// write never leaves a broken file.
async function writeJson(file, data) {
  const text = JSON.stringify(data, null, 2).replace(
    /^( *"(?:connect|elsewhere)": )\[\n([^\]]*)\n *\]/gm,
    (whole, key, items) => {
      const line = `${key}[${items
        .trim()
        .split(/,\n\s*/)
        .join(", ")}]`;
      return line.length < 80 ? line : whole;
    },
  );
  await writeFile(`${file}.tmp`, `${text}\n`);
  await rename(`${file}.tmp`, file);
}

try {
  const old = await previous();
  let tools = null;
  try {
    tools = await livePolicies();
  } catch (error) {
    warn(`checks kept as before, no experiment list: ${error}`);
  }
  const results = {};
  for (const tool of tools ?? []) {
    const { id } = tool;
    if ("error" in tool) {
      results[id] = { error: tool.error };
      warn(
        `${id} kept ${Object.hasOwn(old, id) ? `its check of ${old[id].checked}` : "no check (the lede leaves the policies out)"}: ${tool.error}`,
      );
      continue;
    }
    const policy = policyOf(tool.header);
    results[id] = policy;
    const cls = classify(id, policy.connect, policy.elsewhere);
    if (cls === "unknown") {
      warn(
        `${id} allows ${allows(policy)}: the lede leaves the policies out until that's put into words`,
      );
    } else {
      console.log(`experiments-csp: ${id} ${cls}`);
    }
  }
  const data = mergeChecks(
    old,
    tools && tools.map((t) => t.id),
    results,
    new Date().toISOString().slice(0, 10),
  );
  await writeJson(OUT, data);
  if (process.argv.includes("--snapshot")) {
    await writeJson(SNAPSHOT, data);
    console.log("experiments-csp: snapshot updated");
  }
} catch (error) {
  // Never the reason a build fails: the page shows what the last good file
  // says, or a lede without the policies.
  warn(`nothing written: ${error}`);
}
if (warnings)
  console.warn(`experiments-csp: ${warnings} warning(s), see above`);
if (STRICT && warnings) {
  console.error("experiments-csp: failing because DATA_STRICT=1");
  process.exitCode = 1;
}
