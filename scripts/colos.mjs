// Writes worker/colos.ts: each Cloudflare data center's airport code and
// its city, for the colophon's Delivery row ("Served from Milan"). Read
// from Cloudflare's own status page, where every location is listed as
// "Milan, Italy - (MXP)". Run by hand when Cloudflare opens new ones
// (`npm run colos`); the build never fetches it. A code the list doesn't
// know yet shows as the code itself.
import { writeFile } from "node:fs/promises";

const SOURCE = "https://www.cloudflarestatus.com/api/v2/components.json";
const OUT = new URL("../worker/colos.ts", import.meta.url);
const LOCATION = /^(.+?) - \(([A-Z]{3})\)$/;

const res = await fetch(SOURCE, { signal: AbortSignal.timeout(15_000) });
if (!res.ok) throw new Error(`colos: ${SOURCE} returned HTTP ${res.status}`);
const { components } = await res.json();

/** @type {Map<string, string>} */
const colos = new Map();
for (const { name } of components) {
  const match = LOCATION.exec(name.trim());
  if (!match) continue;
  const [, place, code] = match;
  // "San Jose, CA, United States" is San Jose.
  const city = place.split(",")[0].trim();
  if (city) colos.set(code, city);
}
// The list has a few hundred; far fewer means the page changed shape.
if (colos.size < 200) {
  throw new Error(`colos: only ${colos.size} locations found, expected 300+`);
}

const entries = [...colos]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([code, city]) => `  ${code}: ${JSON.stringify(city)},`)
  .join("\n");
await writeFile(
  OUT,
  `// Cloudflare's data centers: airport code to city. Written by
// scripts/colos.mjs from Cloudflare's status page; don't edit by hand.
export const COLOS: Readonly<Record<string, string>> = {
${entries}
};
`,
);
console.log(`colos: ${colos.size} locations written to worker/colos.ts`);
