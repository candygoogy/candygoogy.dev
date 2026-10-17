// Writes dist/third-party-licenses.txt: the notices for third-party code
// shipped in the site's pages. That's every package from node_modules the
// client build put into a chunk, and the build's own helpers it copies in
// (Vite's preload helper, Rolldown's runtime, which arrive as virtual
// "\0name/…" modules), each with its licence text as the package ships it.
// Sorted by name and free of dates or paths, so every build writes the
// same file. After the packages come the two fonts every page uses
// (src/fonts/, built by scripts/make-fonts.py), each with its OFL text.
//
// Only the client build counts: it's what visitors download. The server
// build that renders the pages ahead of time never leaves the build. If the
// client build's chunks can't be seen, the build fails rather than write a
// list that might be wrong.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const NODE_MODULES = fileURLToPath(
  new URL("../node_modules/", import.meta.url),
);
const MARK = "node_modules/";
const FONTS_DIR = fileURLToPath(new URL("../src/fonts/", import.meta.url));

// The google/fonts commit scripts/make-fonts.py builds from (its COMMIT; a
// unit test keeps the two the same), and each font's version there.
export const FONTS_COMMIT = "47d54ca1ebb14fd864695f1d39dc734f39017c33";
export const FONTS = [
  {
    name: "Newsreader",
    version: "1.003",
    source: "ofl/newsreader",
    license: "OFL-Newsreader.txt",
  },
  {
    name: "Schibsted Grotesk",
    version: "1.100",
    source: "ofl/schibstedgrotesk",
    license: "OFL-SchibstedGrotesk.txt",
  },
];

/** The package a bundled module came from, as its folder and name. */
function packageOf(/** @type {string} */ id) {
  const path = id.replaceAll("\\", "/");
  if (path.startsWith("\0")) {
    const name = /^\0(@[^/]+\/[^/]+|[^/]+)\//.exec(path)?.[1];
    if (!name) return null;
    const dir = join(NODE_MODULES, name);
    return existsSync(join(dir, "package.json")) ? { dir, name } : null;
  }
  const at = path.lastIndexOf(MARK);
  if (at === -1) return null; // the site's own code
  const rest = path.slice(at + MARK.length).split("/");
  const name = rest[0]?.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name) return null;
  return { dir: path.slice(0, at + MARK.length) + name, name };
}

/** The package's licence text. A licence file that also carries the
 * licences of the package's own build-time dependencies (Vite's) is cut
 * there, since none of those is in the pages. */
function licenceText(/** @type {string} */ dir) {
  const file = readdirSync(dir)
    .filter((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f))
    .sort()[0];
  if (!file) return "(The package ships no licence file.)";
  const text = readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
  const cut = text.search(/^#+\s*Licen[cs]es? of bundled dependencies/im);
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}

/** @param {Iterable<string>} moduleIds */
export function thirdPartyNotices(moduleIds) {
  /** @type {Map<string, string>} */
  const packages = new Map();
  for (const id of moduleIds) {
    const found = packageOf(id);
    if (found) packages.set(found.name, found.dir);
  }
  const head = [
    "Third-party code and fonts in this site",
    "",
    packages.size
      ? "This site's pages include code from the open-source packages below, each under its own licence."
      : "This site's pages include no third-party code.",
    "The two fonts they use come last, each under the SIL Open Font License 1.1.",
  ];
  const entries = [...packages]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, dir]) => {
      /** @type {{ version?: string, license?: string }} */
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return [
        "-".repeat(72),
        `${name} ${pkg.version ?? ""} (${pkg.license ?? "licence not stated"})`,
        "",
        licenceText(dir),
      ].join("\n");
    });
  const fonts = FONTS.map((font) =>
    [
      "-".repeat(72),
      `${font.name} ${font.version} (OFL-1.1)`,
      "",
      `From google/fonts at commit ${FONTS_COMMIT} (${font.source}), subset for this site by scripts/make-fonts.py.`,
      "",
      readFileSync(join(FONTS_DIR, font.license), "utf8")
        .replace(/\r\n/g, "\n")
        .trim(),
    ].join("\n"),
  );
  return `${[...head, ...[...entries, ...fonts].flatMap((e) => ["", e])].join("\n")}\n`;
}

/** @returns {import("astro").AstroIntegration} */
export default function thirdPartyLicenses() {
  /** @type {Set<string>} */
  const ids = new Set();
  let sawClient = false;
  return {
    name: "third-party-licenses",
    hooks: {
      "astro:config:setup": ({ command, updateConfig }) => {
        if (command !== "build") return;
        updateConfig({
          vite: {
            plugins: [
              {
                name: "third-party-licenses:collect",
                generateBundle(_, bundle) {
                  const environment = this.environment?.name;
                  if (!environment) {
                    this.error(
                      "third-party licences: the build doesn't say which environment it is, so the client's code can't be told apart.",
                    );
                  }
                  if (environment !== "client") return;
                  sawClient = true;
                  for (const file of Object.values(bundle)) {
                    if (file.type !== "chunk") continue;
                    if (!Array.isArray(file.moduleIds)) {
                      this.error(
                        `third-party licences: ${file.fileName} lists no modules, so its packages can't be named.`,
                      );
                    }
                    for (const id of file.moduleIds) ids.add(id);
                  }
                },
              },
            ],
          },
        });
      },
      "astro:build:done": async ({ dir }) => {
        if (!sawClient) {
          throw new Error(
            "third-party licences: the client build was never seen, so the list of shipped packages is unknown.",
          );
        }
        // Sorted, so the file doesn't depend on the order chunks came in.
        const text = thirdPartyNotices([...ids].sort());
        await writeFile(
          join(fileURLToPath(dir), "third-party-licenses.txt"),
          text,
        );
      },
    },
  };
}
