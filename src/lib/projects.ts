import { existsSync } from "node:fs";
import { join } from "node:path";
import { type CollectionEntry, getCollection } from "astro:content";
import { featuredProject } from "../data/site";
import { latestVersion, root } from "./github";

type Project = CollectionEntry<"projects">;

// Every published project, in the order the site lists them: own work
// first (the products, the featured one first, then side projects), then
// client sites; newest first within each kind.
const rank = { product: 0, side: 1, website: 2 };
const lead = (p: Project) => (p.id === featuredProject ? 0 : 1);

// The featured product has a page of its own, src/pages/<id>.astro, so
// featuring another one in site.ts means giving it that page. Checked once,
// at build time (paths are joined onto the project root from lib/github.ts).
if (!existsSync(join(root, `src/pages/${featuredProject}.astro`)))
  throw new Error(
    `the featured product needs src/pages/${featuredProject}.astro`,
  );

export async function orderedProjects(): Promise<Project[]> {
  const projects = await getCollection("projects", ({ data }) => !data.draft);
  // Every product is linked as /<id>, so each must have a page: the
  // featured one is its own file (above), the rest come from page:.
  // A product without one fails the build instead of linking to a 404.
  // Its page's link preview is public/og-<id>.png, made by scripts/og.mjs
  // from the dev server, so only a production build asks for it.
  for (const p of projects) {
    if (p.data.kind !== "product") continue;
    if (!p.data.page) throw new Error(`product ${p.id} has no page: section`);
    if (
      !import.meta.env.DEV &&
      !existsSync(join(root, `public/og-${p.id}.png`))
    )
      throw new Error(
        `product ${p.id} has no public/og-${p.id}.png (run scripts/og.mjs)`,
      );
  }
  return projects.sort(
    (a, b) =>
      rank[a.data.kind] - rank[b.data.kind] ||
      lead(a) - lead(b) ||
      b.data.date.valueOf() - a.data.date.valueOf(),
  );
}

// The shortlist in the hero's index and the menu: the featured projects,
// in the page's order. It stays about as tall as the headline and its
// line however many projects there are; the projects list has them all.
export function featuredProjects(projects: Project[]): Project[] {
  const featured = projects.filter((p) => p.data.featured);
  if (featured.length < 1 || featured.length > 4)
    throw new Error("one to four projects must be featured");
  return featured;
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
