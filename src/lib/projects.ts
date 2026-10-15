import { type CollectionEntry, getCollection } from "astro:content";
import { featuredProject } from "../data/site";
import { latestVersion } from "./github";

type Project = CollectionEntry<"projects">;

// Every published project, in the order the site lists them: own work
// first (the products, the featured one first, then side projects), then
// client sites; newest first within each kind.
const rank = { product: 0, side: 1, website: 2 };
const lead = (p: Project) => (p.id === featuredProject ? 0 : 1);

export async function orderedProjects(): Promise<Project[]> {
  return (await getCollection("projects", ({ data }) => !data.draft)).sort(
    (a, b) =>
      rank[a.data.kind] - rank[b.data.kind] ||
      lead(a) - lead(b) ||
      b.data.date.valueOf() - a.data.date.valueOf(),
  );
}

// Products other than the featured one: each has its own page at
// /<id>, from the shared product template.
export const ownPages = (projects: Project[]) =>
  projects.filter(
    (p) => p.data.kind === "product" && p.id !== featuredProject && p.data.page,
  );

// A product's release as the build sees it: the latest published release
// on GitHub (scripts/github-data.mjs), or the entry's own fallback, and
// where to get it. A product with no site of its own ships as GitHub
// releases.
export function release({ data }: Project) {
  const version = latestVersion(data.repo, data.version);
  const get =
    data.links.live ??
    (data.repo ? `https://github.com/${data.repo}/releases/latest` : undefined);
  return { version, get };
}
