import { type CollectionEntry, getCollection } from "astro:content";

// Every published project, in the order the site lists them: own work
// first (the product, then side projects), then client sites; newest
// first within each kind.
const rank = { product: 0, side: 1, website: 2 };

export async function orderedProjects(): Promise<
  CollectionEntry<"projects">[]
> {
  return (await getCollection("projects", ({ data }) => !data.draft)).sort(
    (a, b) =>
      rank[a.data.kind] - rank[b.data.kind] ||
      b.data.date.valueOf() - a.data.date.valueOf(),
  );
}
