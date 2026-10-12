// The plain-text card for terminals (`curl candygoogy.dev`), written at
// build time from the site's own data: every line already appears on the
// site. The Worker serves it on "/" to curl, Wget, HTTPie and xh
// (worker/index.ts). Under 80 columns, no colors, plain layout.
import type { APIRoute } from "astro";
import { hero, site } from "../data/site";
import { builtOn, commit } from "../lib/build";
import { orderedProjects } from "../lib/projects";

const WIDTH = 72;

// Greedy word wrap to WIDTH columns, with an optional indent for the
// lines after the first.
function wrap(text: string, indent = ""): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > WIDTH) {
      lines.push(line);
      line = indent + word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

const heading = (text: string) => `${text}\n${"-".repeat(text.length)}`;

export const GET: APIRoute = async () => {
  const projects = await orderedProjects();
  const col = Math.max(...projects.map((p) => p.data.name.length)) + 3;
  const pad = (s: string, n: number) =>
    s + " ".repeat(Math.max(n - s.length, 1));
  const url = (p: (typeof projects)[number]) =>
    p.data.kind === "product"
      ? `${site.url}/${p.id}`
      : (p.data.links.live ?? p.data.links.source ?? "");

  const rows = projects.flatMap((p) => [
    pad(p.data.name, col) + p.data.blurb,
    " ".repeat(col) + url(p),
  ]);

  const links: [string, string][] = [
    ["GitHub", site.github],
    ["X", site.x],
    ["Discord", site.discord],
    ["Telegram", site.telegram],
  ];
  const linkCol = Math.max(...links.map(([l]) => l.length)) + 3;

  const stamp = commit
    ? `Built ${builtOn.label} from ${commit.slice(0, 7)}`
    : `Built ${builtOn.label}`;

  const body = [
    `${site.name}\n${"=".repeat(site.name.length)}`,
    wrap(hero.headline),
    wrap(hero.line),
    heading(hero.indexTitle),
    rows.join("\n"),
    heading("Contact"),
    [
      site.email,
      ...links.map(([label, href]) => pad(label, linkCol) + href),
    ].join("\n"),
    stamp,
  ].join("\n\n");

  return new Response(`\n${body}\n\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
