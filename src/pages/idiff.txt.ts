// /idiff for terminals: the product page as a plain-text card, built
// from its entry (src/lib/card.ts). The Worker serves it on /idiff to
// curl, Wget, HTTPie and xh (worker/index.ts).
import type { APIRoute } from "astro";
import { getEntry } from "astro:content";
import { productCard, textResponse } from "../lib/card";

export const GET: APIRoute = async () => {
  const project = await getEntry("projects", "idiff");
  if (!project) throw new Error("projects/idiff.md is missing");
  return textResponse(productCard(project));
};
