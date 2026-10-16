// The Atom feed of new releases and experiments (/feed.xml), written at
// build time: each product's published releases (scripts/github-data.mjs
// fetches them) and each experiment, by the day it went up. Every entry
// links where it lives and carries the summary the site already shows.
// Linked from each page's head and named once, on /colophon.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { site } from "../data/site";
import { atom, type Entry, rfc3339 } from "../lib/feed";
import { github } from "../lib/github";

export const GET: APIRoute = async () => {
  const products = await getCollection(
    "projects",
    ({ data }) => !data.draft && data.kind === "product" && !!data.repo,
  );
  const experiments = await getCollection(
    "experiments",
    ({ data }) => !data.draft && data.status !== "retired",
  );
  const entries: Entry[] = [
    ...products.flatMap(({ data }) =>
      (github.releases[data.repo ?? ""] ?? []).map((r) => ({
        title: `${data.name} ${r.tag.replace(/^v/, "")}`,
        url: r.url,
        updated: rfc3339(new Date(r.published)),
        summary: data.summary,
      })),
    ),
    ...experiments.map(({ data }) => ({
      title: `New experiment: ${data.name}`,
      url: data.url,
      updated: rfc3339(data.date),
      summary: data.summary,
    })),
  ];
  return new Response(
    atom({
      title: site.name,
      site: `${site.url}/`,
      self: `${site.url}/feed.xml`,
      author: site.name,
      entries,
    }),
    { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } },
  );
};
