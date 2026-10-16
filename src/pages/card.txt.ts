// The plain-text card for terminals (`curl candygoogy.dev`), written at
// build time from the site's own data: every line already appears on the
// site. The Worker serves it on "/" to curl, Wget, HTTPie and xh
// (worker/index.ts). The helpers and the width are in src/lib/card.ts.
import type { APIRoute } from "astro";
import { experiments } from "../data/experiments";
import { hero, site } from "../data/site";
import {
  columns,
  heading,
  stamp,
  textResponse,
  title,
  wrap,
} from "../lib/card";
import { orderedProjects } from "../lib/projects";

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

  const body = [
    title(site.name),
    wrap(hero.headline),
    wrap(hero.line),
    heading(hero.indexTitle),
    rows.join("\n"),
    heading(experiments.title),
    `${wrap(experiments.description)}\n${site.url}/experiments`,
    heading("Contact"),
    `${site.email}\n${columns(links)}`,
    stamp(),
  ].join("\n\n");

  return textResponse(body);
};
