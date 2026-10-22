// The map's content feed (/map.json), written at build time from the
// site's own data (src/lib/map-feed.ts). The map reads it once, at its own
// build time; no page links to it.
import type { APIRoute } from "astro";
import { buildMapFeed } from "../lib/map-feed";

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await buildMapFeed()), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
