import assert from "node:assert/strict";
import test from "node:test";
import {
  checkIndexes,
  checkLive,
  checkPolicies,
  menuIndex,
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

// The tools' live header (2026-10-17), with connect-src as given.
const live = (connect) =>
  `default-src 'self'; connect-src ${connect}; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;

test("checkPolicies: expected policies pass in one line", () => {
  const lines = checkPolicies([
    { id: "photo", header: live("'none'") },
    { id: "mail", header: live("https://cloudflare-dns.com") },
  ]);
  assert.deepEqual(lines, [
    { ok: true, text: "experiments' policies: photo none, mail dns" },
  ]);
});

test("checkPolicies: a looser policy, no header or no answer fails", () => {
  const lines = checkPolicies([
    { id: "photo", header: live("https://cloudflare-dns.com") },
    { id: "subnet", header: null },
    { id: "mail", error: new Error("HTTP 503") },
    { id: "battery", header: live("'none'") },
    {
      id: "logscope",
      header: live("'none'").replace("img-src", "img-src https:"),
    },
  ]);
  assert.deepEqual(
    lines.map((l) => l.ok),
    [false, false, false, false, true],
  );
  assert.match(
    lines[0].text,
    /photo allows connect-src https:\/\/cloudflare-dns\.com, more than "none"/,
  );
  assert.match(lines[1].text, /subnet allows connect-src \*/);
  assert.match(lines[2].text, /mail: couldn't check .*HTTP 503/);
  assert.match(
    lines[3].text,
    /logscope allows .*img-src https:.*more than "none"/,
  );
  assert.deepEqual(checkPolicies([]), [
    { ok: false, text: "no experiments to check" },
  ]);
});

test("checkPolicies: mail no longer listed fails, since the lede names it", () => {
  const lines = checkPolicies([{ id: "photo", header: live("'none'") }]);
  assert.deepEqual(
    lines.map((l) => l.ok),
    [false, true],
  );
  assert.match(lines[0].text, /^mail isn't listed on \/experiments/);
});

// The home page's menu index as built (2026-10-18), with its scoped-style
// attributes, the nowrap span and relative links; the script after it
// names data-menu-index too.
const SITE_MENU = `<div class="shortlist wrap" data-menu-index data-astro-cid-nen7h5rs><nav class="index in-menu" aria-labelledby="menu-index-title" data-astro-cid-bqh5cn3t><h2 id="menu-index-title" data-astro-cid-bqh5cn3t>A few things I’ve built</h2><ol data-astro-cid-bqh5cn3t><li data-i="0" data-astro-cid-bqh5cn3t><a class="shift" href="/fettle" data-astro-cid-bqh5cn3t><span class="name vt-project-title" data-astro-cid-bqh5cn3t>Fettle</span><span class="blurb" data-astro-cid-bqh5cn3t>Windows <span class="nobr">check-up</span>, printed as a readable receipt</span></a></li><li data-i="1" data-astro-cid-bqh5cn3t><a class="shift" href="/idiff" data-astro-cid-bqh5cn3t><span data-vt="idiff" class="name vt-project-title" data-astro-cid-bqh5cn3t>Install diff</span><span class="blurb" data-astro-cid-bqh5cn3t>What an installer did to your PC, in plain words</span></a></li><li data-i="2" data-astro-cid-bqh5cn3t><a class="shift" href="#notary" data-astro-cid-bqh5cn3t><span class="name" data-astro-cid-bqh5cn3t>Notary</span><span class="blurb" data-astro-cid-bqh5cn3t>Claude Code mods that check Claude’s work</span></a></li></ol></nav></div><script type="module">n?.querySelector(\`[data-menu-index]\`)</script>`;
// An experiment's copy: its own classes, absolute links, escaped text.
const TOOL_MENU = `<section class="menu-projects" data-menu-index>
  <h2>A few things I&#8217;ve built</h2>
  <ol>
    <li><a href="https://candygoogy.dev/fettle"><span class="t">Fettle</span>
      <span class="d">Windows <span class="nw">check-up</span>,
      printed as a readable receipt</span></a></li>
    <li><a href="https://candygoogy.dev/idiff"><span class="t">Install diff</span><span class="d">What an installer did to your PC, in plain words</span></a></li>
    <li><a href="https://candygoogy.dev/#notary"><span class="t">Notary</span><span class="d">Claude Code mods that check Claude&rsquo;s work</span></a></li>
  </ol>
</section>`;
const TOOL_URL = "https://keyboard.candygoogy.dev/";

test("menuIndex: reads the site's and a tool's markup the same", () => {
  const site = menuIndex(SITE_MENU, "https://candygoogy.dev/");
  assert.deepEqual(site, menuIndex(TOOL_MENU, TOOL_URL));
  assert.equal(site.title, "A few things I’ve built");
  assert.deepEqual(site.rows[0], {
    name: "Fettle",
    blurb: "Windows check-up, printed as a readable receipt",
    href: "https://candygoogy.dev/fettle",
  });
  assert.equal(site.rows[2].href, "https://candygoogy.dev/#notary");
  assert.deepEqual(
    checkIndexes(SITE_MENU, [
      { id: "keyboard", url: TOOL_URL, html: TOOL_MENU },
    ]),
    [
      {
        ok: true,
        text: "experiments' menu index matches the site's 3 rows: keyboard",
      },
    ],
  );
});

test("checkIndexes: a drifted, missing or unfetched index fails by name", () => {
  const lines = checkIndexes(SITE_MENU, [
    {
      id: "keyboard",
      url: TOOL_URL,
      html: TOOL_MENU.replace("#notary", "#x").replace("plain words", "words"),
    },
    { id: "photo", url: TOOL_URL, html: "<header><nav></nav></header>" },
    { id: "mail", error: new Error("HTTP 503") },
    { id: "subnet", url: TOOL_URL, html: TOOL_MENU },
  ]);
  assert.deepEqual(
    lines.map((l) => l.ok),
    [false, false, false, true],
  );
  assert.match(
    lines[0].text,
    /^keyboard: row 2 blurb "What an installer did to your PC, in words", site has "[^"]+plain words"; row 3 href https:\/\/candygoogy\.dev\/#x, site has https:\/\/candygoogy\.dev\/#notary:/,
  );
  assert.match(lines[1].text, /^photo: no menu index/);
  assert.match(
    lines[2].text,
    /^mail: couldn't check its menu index: .*HTTP 503/,
  );
  assert.match(lines[3].text, /matches the site's 3 rows: subnet$/);
});
