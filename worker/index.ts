// The site is static assets (served before this Worker runs). The Worker
// does a few small jobs:
//  - GET /api/presence: candygoogy's Discord status, read server-side from
//    Lanyard and reduced to one field, so visitors' browsers only ever talk
//    to candygoogy.dev.
//  - Plain-text cards for terminals on /, /fettle and /idiff.
//  - On /colophon, a Server-Timing header saying which Cloudflare city
//    served the page and the round trip to it, for the Delivery row.
//  - A daily Cron Trigger that asks Workers Builds to rebuild the site, so
//    the heatmap and the Fettle version stay fresh.
//
// DEPLOY_HOOK_URL is a runtime secret (`wrangler secret put DEPLOY_HOOK_URL`),
// never in wrangler.jsonc or the repo.

import { COLOS } from "./colos.ts";

interface Env {
  ASSETS: Fetcher;
  DEPLOY_HOOK_URL?: string;
}

const LANYARD = "https://api.lanyard.rest/v1/users/699600164180066376";
const STATES = new Set(["online", "idle", "dnd", "offline"]);

// Only the status leaves this function: never activities, Spotify, custom
// status, avatar or anything else Lanyard returns.
async function presence(request: Request, ctx: ExecutionContext) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const cache = caches.default;
  const key = new Request(new URL("/api/presence", request.url).toString());
  const hit = await cache.match(key);
  // A hit comes back with the zone's Browser Cache TTL (4 hours) as its
  // Cache-Control, so it is answered afresh from its status, as a miss is.
  if (hit) {
    const { status } = (await hit.json()) as { status: string | null };
    return answer(status);
  }

  let status: string | null = null;
  try {
    const res = await fetch(LANYARD, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { discord_status?: unknown };
      };
      const value = json.data?.discord_status;
      if (typeof value === "string" && STATES.has(value)) status = value;
    }
  } catch {
    // Timeout or network error: report no status.
  }

  const response = answer(status);
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

// The presence response, the same from Lanyard or from the cache.
function answer(status: string | null) {
  return new Response(JSON.stringify({ status }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // A failed lookup is kept briefly too, so a Lanyard outage costs one
      // slow fetch every 15 seconds, not one per visitor.
      "Cache-Control": `public, max-age=${status ? 30 : 15}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// The pages with a plain-text card for terminals: `curl candygoogy.dev`
// (and Wget, HTTPie, xh) gets /card.txt, and `curl candygoogy.dev/idiff`
// the product's own card, all built with the site (src/lib/card.ts); a
// draft product has none, so terminals get its 404 page.
// Browsers get the page, untouched. Both carry Vary: User-Agent, so caches
// keep them apart. Each path here is also in run_worker_first
// (wrangler.jsonc), or the assets would answer it without the Worker.
const CARDS = new Map([
  ["/", "/card.txt"],
  ["/fettle", "/fettle.txt"],
  ["/idiff", "/idiff.txt"],
]);
const TERMINAL = /^(curl|Wget|HTTPie|xh)\//i;
const HELLO =
  "Hi. Curious how this works? The source is at github.com/candygoogy/candygoogy.dev";

async function page(request: Request, env: Env, cardPath: string) {
  const agent = request.headers.get("User-Agent") ?? "";
  const wantsText =
    TERMINAL.test(agent) &&
    (request.method === "GET" || request.method === "HEAD");
  if (wantsText) {
    const card = await env.ASSETS.fetch(new URL(cardPath, request.url));
    if (card.ok) {
      // A HEAD sends no body: the card's own is let go, not left open.
      if (request.method === "HEAD") await card.body?.cancel();
      return new Response(request.method === "HEAD" ? null : card.body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=0, must-revalidate",
          Vary: "User-Agent",
          "x-hello": HELLO,
          // Plain text runs and loads nothing; the pages' own policy is in
          // their HTML and public/_headers, which this response skips.
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      });
    }
    // No card: its 404 is let go, and the terminal gets the page, as a
    // browser does.
    await card.body?.cancel();
  }
  const page = await env.ASSETS.fetch(request);
  const response = new Response(page.body, page);
  response.headers.append("Vary", "User-Agent");
  return response;
}

// Where this response comes from, for the colophon's Delivery row: the
// city of the Cloudflare data center that answered (request.cf.colo, an
// airport code), Cloudflare's own measure of the round trip to the
// visitor, and the HTTP version they came in on, as a Server-Timing header
// the page reads as it arrives. (The browser knows the version too, but
// not on a revalidated page.) Nothing about the visitor themselves
// (request.cf.city would be where they are), and nothing kept. The city is
// percent-encoded: "São Paulo" isn't ASCII.
const PROTOCOL = /^HTTP\/[0-9.]+$/;

function delivery(cf: Request["cf"]) {
  const colo = typeof cf?.colo === "string" ? cf.colo : "";
  if (!/^[A-Z]{3}$/.test(colo)) return null;
  const city = COLOS[colo] ?? colo;
  const timing = [`edge;desc="${encodeURIComponent(city)}"`];
  // TCP's round trip, or QUIC's on HTTP/3 (0 when it's the other one).
  const quic = (cf as { clientQuicRtt?: unknown } | undefined)?.clientQuicRtt;
  const rtt = [cf?.clientTcpRtt, quic].find(
    (ms): ms is number => typeof ms === "number" && ms > 0,
  );
  if (rtt !== undefined) timing.push(`rtt;dur=${Math.round(rtt)}`);
  const protocol = cf?.httpProtocol;
  if (typeof protocol === "string" && PROTOCOL.test(protocol)) {
    timing.push(`proto;desc="${protocol}"`);
  }
  return timing.join(", ");
}

// The colophon, as built, plus the header. A 304 (a returning visitor's
// browser revalidating) carries it too, so the row shows this visit.
async function colophon(request: Request, env: Env) {
  const page = await env.ASSETS.fetch(request);
  const timing = delivery(request.cf);
  if (!timing) return page;
  const response = new Response(page.body, page);
  response.headers.set("Server-Timing", timing);
  return response;
}

export default {
  // Matching static assets never reach the Worker, except the pages with
  // a card ("/", /fettle, /idiff), which run the Worker first
  // (run_worker_first in wrangler.jsonc) so terminals can get their
  // plain-text card, and /colophon, for its Delivery header. Anything else
  // goes back to the assets (which serve the 404 page).
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/presence") {
      return presence(request, ctx);
    }
    if (pathname === "/colophon") return colophon(request, env);
    const card = CARDS.get(pathname);
    if (card) return page(request, env, card);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env) {
    if (!env.DEPLOY_HOOK_URL) {
      console.warn("scheduled: DEPLOY_HOOK_URL is not set, skipping rebuild");
      return;
    }
    // A hook that never answers fails the run instead of hanging it.
    const res = await fetch(env.DEPLOY_HOOK_URL, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`scheduled: deploy hook returned HTTP ${res.status}`);
    }
    console.log("scheduled: rebuild requested");
  },
} satisfies ExportedHandler<Env>;
