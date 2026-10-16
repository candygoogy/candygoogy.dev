import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { csp, policyFor, scriptType } from "../../scripts/csp.mjs";

const sha = (text) =>
  `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
const directive = (policy, name) =>
  policy.split(";").find((d) => d.trim().startsWith(`${name} `)) ?? "";

test("inline classic and module scripts are hashed", () => {
  const { policy, problem, count } = policyFor(
    '<script>one()</script><script type="module">two()</script>',
  );
  const scripts = directive(policy, "script-src");
  assert.ok(scripts.includes(sha("one()")));
  assert.ok(scripts.includes(sha("two()")));
  assert.equal(problem, undefined);
  assert.equal(count, 2);
});

test("a script with src gets no hash", () => {
  const { policy, problem, count } = policyFor('<script src="/a.js"></script>');
  assert.equal(directive(policy, "script-src").trim(), "script-src 'self'");
  assert.equal(problem, undefined);
  assert.equal(count, 0);
});

test("data-src isn't src: that script is hashed", () => {
  const { policy } = policyFor('<script data-src="x">code()</script>');
  assert.ok(directive(policy, "script-src").includes(sha("code()")));
});

test("JSON-LD and the motion loader tag are neither hashed nor a problem", () => {
  const { policy, problem, count } = policyFor(
    '<script type="application/ld+json">{"a":1}</script>' +
      '<script type="text/motion-loader">load</script>',
  );
  assert.equal(problem, undefined);
  assert.equal(count, 0);
  assert.ok(!directive(policy, "script-src").includes("sha256-"));
});

test("speculation rules are hashed into script-src, in any case", () => {
  const rules = '{"prefetch":[{"where":{"href_matches":"/*"}}]}';
  const { policy, problem, count } = policyFor(
    `<script type="speculationrules">${rules}</script>` +
      `<script type="SpeculationRules">${rules} </script>`,
  );
  const scripts = directive(policy, "script-src");
  assert.ok(scripts.includes(sha(rules)));
  assert.ok(scripts.includes(sha(`${rules} `)));
  assert.equal(problem, undefined);
  assert.equal(count, 2);
});

test("a script of an unknown type is a problem", () => {
  const { problem } = policyFor(
    '<script type="application/javascript">x()</script>',
  );
  assert.match(problem, /application\/javascript/);
});

test("an event handler attribute is a problem", () => {
  const { problem } = policyFor('<button onclick="go()">Go</button>');
  assert.equal(problem, "an event handler attribute");
});

test("a javascript: address is a problem", () => {
  const { problem } = policyFor('<a href="javascript:void(0)">x</a>');
  assert.equal(problem, "a javascript: address");
});

test("handlers and javascript: addresses are found in any case or quote", () => {
  assert.equal(
    policyFor('<button onClick="go()">Go</button>').problem,
    "an event handler attribute",
  );
  for (const html of [
    "<a href='javascript:void(0)'>x</a>",
    "<a href=javascript:void(0)>x</a>",
    '<svg><a xlink:href="javascript:go()">x</a></svg>',
    '<a HREF = "JavaScript:go()">x</a>',
  ]) {
    assert.equal(policyFor(html).problem, "a javascript: address", html);
  }
});

test("a script's type is read the way the browser reads it", () => {
  assert.equal(scriptType(' type=" Module "'), "module");
  assert.equal(scriptType(' data-type="x"'), "");
});

test("a single-quoted style attribute is hashed too", () => {
  const { policy } = policyFor("<p style='--i: 3'>x</p>");
  assert.ok(directive(policy, "style-src").includes(sha("--i: 3")));
});

test("a style attribute adds its hash and 'unsafe-hashes'", () => {
  const { policy, problem } = policyFor(
    '<p style="--i: 2">x</p><style>p{color:red}</style>',
  );
  const styles = directive(policy, "style-src");
  assert.ok(styles.includes("'unsafe-hashes'"));
  assert.ok(styles.includes(sha("--i: 2")));
  assert.ok(styles.includes(sha("p{color:red}")));
  assert.equal(problem, undefined);
});

test("a style attribute is hashed as the browser reads it, entities decoded", () => {
  const { policy } = policyFor('<p style="--x: &quot;a&amp;b&quot;">x</p>');
  assert.ok(directive(policy, "style-src").includes(sha('--x: "a&b"')));
});

const quiet = { info() {} };
const good = '<meta charset="utf-8"><p>x</p>';

test("the build fails on a page without the charset to put the policy after", () => {
  assert.throws(
    () =>
      csp(
        [
          { page: "a.html", html: good },
          { page: "b.html", html: "<p>x</p>" },
        ],
        quiet,
      ),
    /b\.html doesn't have exactly one <meta charset="utf-8">/,
  );
});

test("the build fails on a page that already has a policy", () => {
  const html = `${good}<meta http-equiv="content-security-policy" content="x">`;
  assert.throws(
    () => csp([{ page: "a.html", html }], quiet),
    /a\.html already has a policy/,
  );
});

test("the build fails when no pages were built", () => {
  assert.throws(() => csp([], quiet), /no pages were built/);
});
