// The map's content feed (/map.json, src/pages/map.json.ts), written at
// build time from the site's own data: every word in it already appears on
// the site. The map (the "candygoogy animated" repo) reads it once, at its
// own build time, and checks it with its parseFeed. Build time only.
import { experiments } from "../data/experiments";
import { hero, site } from "../data/site";
import { uses, type NetRow } from "../data/uses";
import { listedExperiments } from "./experiments-csp";
import { orderedProjects, release } from "./projects";

// The feed's shape. Its twin is src/data/feed.ts in the map repo (the
// contract, with parseFeed): change one, change the other. Only the kinds
// the feed may carry are here; the map adds its own ("device", "secret"),
// and parent, which the feed never sets.

export interface MapFeed {
  version: 1;
  generated: string;
  site: {
    name: string;
    url: string;
    headline: string;
    line: string;
    links: Link[];
  };
  nodes: FeedNode[];
}

export interface Link {
  label: string;
  href: string;
}

export type NodeKind =
  "origin" | "project" | "experiments" | "homelab" | "colophon" | "exit";

export interface FeedNode {
  id: string;
  kind: NodeKind;
  name: string;
  blurb?: string;
  summary?: string;
  status?: string;
  version?: string;
  runsOn?: string;
  license?: string;
  stack?: string[];
  links: Link[];
  updated?: string;
  page?: string;
  children?: { id: string; name: string; href: string }[];
  devices?: Device[];
}

/** One of the homelab's devices, in tree order: each after the one it
 * hangs off (parent). */
export interface Device {
  id: string;
  label: string;
  product: string;
  parent?: string;
  detail?: string;
}

// The colophon's name and line live only in its pages: the footer's link
// (components/Footer.astro) and the page's line (pages/colophon.astro).
// Change them there, change them here.
const colophon = {
  name: "Colophon",
  summary: "How this site is made, for anyone who wonders.",
};

// The address as the rows show it: "fettle.page", "sieleolie.com".
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

// An optional field only when it has a value: parseFeed takes a key that's
// there but empty as a mistake.
const opt = <K extends string, V>(key: K, value: V | undefined | "") =>
  (value === undefined || value === "" ? {} : { [key]: value }) as Partial<
    Record<K, V>
  >;

// A device's line as /uses shows it: the soft tag, then the text
// ("Runs candygoogy-bot").
const device = (row: NetRow): Device => ({
  id: row.id,
  label: row.label,
  product: row.product,
  ...opt("parent", row.parent),
  ...opt(
    "detail",
    row.detail && [row.detail.tag, row.detail.text].filter(Boolean).join(" "),
  ),
});

export async function buildMapFeed(): Promise<MapFeed> {
  const links: Link[] = [
    { label: "GitHub", href: site.github },
    { label: "X", href: site.x },
    { label: "Discord", href: site.discord },
    { label: "Telegram", href: site.telegram },
    { label: site.email, href: `mailto:${site.email}` },
  ];

  // In the site's order (lib/projects.ts), with the links the facts and
  // rows show: the live site by its address, then the source.
  const projects: FeedNode[] = (await orderedProjects()).map((p) => {
    const { data } = p;
    const projectLinks: Link[] = [];
    if (data.links.live)
      projectLinks.push({
        label: host(data.links.live),
        href: data.links.live,
      });
    if (data.links.source)
      projectLinks.push({ label: "Source on GitHub", href: data.links.source });
    return {
      id: p.id,
      kind: "project",
      name: data.name,
      blurb: data.blurb,
      summary: data.summary,
      status: data.status,
      ...opt("version", release(p).version),
      ...opt("runsOn", data.runsOn),
      ...opt("license", data.license),
      stack: data.stack,
      links: projectLinks,
      updated: data.date.toISOString().slice(0, 10),
      ...opt("page", data.kind === "product" ? `/${p.id}` : undefined),
    };
  });

  const homelab = uses.sections.find((s) => s.id === "homelab");
  if (!homelab || !("net" in homelab))
    throw new Error("map feed: uses.ts has no homelab section with net rows");

  return {
    version: 1,
    generated: new Date().toISOString(),
    site: {
      name: site.name,
      url: site.url,
      headline: hero.headline,
      line: hero.line,
      links,
    },
    nodes: [
      {
        id: "origin",
        kind: "origin",
        name: host(site.url),
        blurb: hero.headline,
        summary: hero.line,
        links,
        page: "/",
      },
      ...projects,
      {
        id: "experiments",
        kind: "experiments",
        name: experiments.title,
        summary: experiments.intro,
        links: [],
        page: "/experiments",
        children: (await listedExperiments()).map(({ id, data }) => ({
          id,
          name: data.name,
          href: data.url,
        })),
      },
      {
        id: "homelab",
        kind: "homelab",
        name: homelab.title,
        summary: uses.lede,
        links: [],
        page: `/uses#${homelab.id}`,
        devices: homelab.net.map(device),
      },
      {
        id: "colophon",
        kind: "colophon",
        name: colophon.name,
        summary: colophon.summary,
        links: [],
        page: "/colophon",
      },
      // The map's way back to the site.
      { id: "exit", kind: "exit", name: "Exit", links: [], page: "/" },
    ],
  };
}
