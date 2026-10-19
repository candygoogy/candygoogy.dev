// /fettle and /idiff for terminals: each product's page as a plain-text
// card, built from its entry (src/lib/card.ts). The Worker serves it on
// /<id> to curl, Wget, HTTPie and xh (worker/index.ts). Only published
// products get one, as only they get a page: a draft has no card, so
// curl gets the same 404 page a browser does.
import type { APIRoute } from "astro";
import type { CollectionEntry } from "astro:content";
import { productCard, textResponse } from "../lib/card";
import { orderedProjects } from "../lib/projects";

export async function getStaticPaths() {
  return (await orderedProjects())
    .filter((project) => project.data.kind === "product")
    .map((project) => ({
      params: { product: project.id },
      props: { project },
    }));
}

export const GET: APIRoute<{ project: CollectionEntry<"projects"> }> = ({
  props,
}) => textResponse(productCard(props.project));
