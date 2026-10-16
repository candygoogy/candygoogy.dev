import assert from "node:assert/strict";
import test from "node:test";
import {
  checkLive,
  checkPolicies,
  newestDay,
} from "../../scripts/check-live.mjs";

// Shaped like the built page and security.txt: a build at 2026-10-16
// 05:20 UTC, with the heatmap ending that day: three days from
// October 14.
const SECURITY_TXT = [
  "Contact: mailto:hello@candygoogy.dev",
  "Expires: 2027-04-14T05:20:00Z",
  "Preferred-Languages: en, it",
  "",
].join("\n");
const HOME = `<div class="heatmap" data-motion="heatmap" data-start="2026-10-14"><table role="grid"><tbody>
<tr><th scope="row" class="dn"><span></span></th><td role="gridcell" tabindex="-1" aria-label="15 contributions on Saturday, October 3, 2026" data-level="1"><span></span></td><td class="pad"><span></span></td></tr>
<tr><th scope="row" class="dn"><span>Fri</span></th><td role="gridcell" tabindex="0" aria-label="19 contributions on Friday, October 16, 2026" data-level="1"><span></span></td><td role="gridcell" tabindex="-1" aria-label="No contributions on Friday, October 9, 2026" data-level="0"><span></span></td></tr>
</tbody></table></div>`;
const at = (iso) => Date.parse(iso);

test("checkLive: a fresh build and heatmap pass", () => {
  const lines = checkLive(SECURITY_TXT, HOME, at("2026-10-16T06:17:00Z"));
  assert.deepEqual(lines, [
    { ok: true, text: "build is 0.9 hours old" },
    { ok: true, text: "heatmap ends 2026-10-16" },
  ]);
});

test("checkLive: a build over 36 hours old fails", () => {
  // 37 hours after the build; the heatmap alone would still pass.
  const lines = checkLive(SECURITY_TXT, HOME, at("2026-10-17T18:20:00Z"));
  assert.equal(lines[0].ok, false);
  assert.match(lines[0].text, /build is 37\.0 hours old/);
  assert.equal(lines[1].ok, true);
});

test("checkLive: a heatmap over 3 days old fails, on its own", () => {
  // A fresh build that kept old data: newest day 4 days before today.
  const stale = HOME.replace("2026-10-14", "2026-10-10");
  const lines = checkLive(SECURITY_TXT, stale, at("2026-10-16T06:17:00Z"));
  assert.equal(lines[0].ok, true);
  assert.equal(lines[1].ok, false);
  assert.match(lines[1].text, /heatmap ends 2026-10-12, 4 days ago/);
});

test("newestDay: counts on from the first day, and throws without one", () => {
  // The labels don't count: rewording them changes nothing.
  assert.equal(newestDay(HOME.replaceAll(" on ", " for ")), "2026-10-16");
  assert.throws(
    () => newestDay(HOME.replace(/ data-start="[^"]*"/, "")),
    /no heatmap on/,
  );
  assert.throws(
    () => newestDay(HOME.replaceAll('role="gridcell"', 'role="none"')),
    /no heatmap days/,
  );
});

test("checkPolicies: expected policies pass in one line", () => {
  const lines = checkPolicies([
    { id: "photo", header: "default-src 'self'; connect-src 'none'" },
    { id: "mail", header: "connect-src https://cloudflare-dns.com" },
  ]);
  assert.deepEqual(lines, [
    { ok: true, text: "experiments' policies: photo none, mail dns" },
  ]);
});

test("checkPolicies: a looser policy, no header or no answer fails", () => {
  const lines = checkPolicies([
    { id: "photo", header: "connect-src https://cloudflare-dns.com" },
    { id: "subnet", header: null },
    { id: "mail", error: new Error("HTTP 503") },
    { id: "battery", header: "connect-src 'none'" },
  ]);
  assert.deepEqual(
    lines.map((l) => l.ok),
    [false, false, false, true],
  );
  assert.match(
    lines[0].text,
    /photo allows connect-src https:\/\/cloudflare-dns\.com, more than "none"/,
  );
  assert.match(lines[1].text, /subnet allows connect-src \*/);
  assert.match(lines[2].text, /mail: couldn't check .*HTTP 503/);
  assert.deepEqual(checkPolicies([]), [
    { ok: false, text: "no experiments to check" },
  ]);
});
