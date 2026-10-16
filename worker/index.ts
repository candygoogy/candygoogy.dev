// The site is static assets (served before this Worker runs). The Worker
// does two small jobs:
//  - GET /api/presence: candygoogy's Discord status, read server-side from
//    Lanyard and reduced to one field, so visitors' browsers only ever talk
//    to candygoogy.dev.
//  - A daily Cron Trigger that asks Workers Builds to rebuild the site, so
//    the heatmap and the Fettle version stay fresh.
//
// DEPLOY_HOOK_URL is a runtime secret (`wrangler secret put DEPLOY_HOOK_URL`),
// never in wrangler.jsonc or the repo.

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
  if (hit) return hit;

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

  const response = new Response(JSON.stringify({ status }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // A failed lookup is kept briefly too, so a Lanyard outage costs one
      // slow fetch every 15 seconds, not one per visitor.
      "Cache-Control": `public, max-age=${status ? 30 : 15}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

// "/" for terminals: `curl candygoogy.dev` (and Wget, HTTPie, xh) gets the
// plain-text card built with the site (/card.txt); browsers get the page,
// untouched. Both carry Vary: User-Agent, so caches keep them apart.
const TERMINAL = /^(curl|Wget|HTTPie|xh)\//i;
const HELLO =
  "Hi. Curious how this works? The source is at github.com/candygoogy/candygoogy.dev";

async function home(request: Request, env: Env) {
  const agent = request.headers.get("User-Agent") ?? "";
  const wantsText =
    TERMINAL.test(agent) &&
    (request.method === "GET" || request.method === "HEAD");
  if (wantsText) {
    const card = await env.ASSETS.fetch(new URL("/card.txt", request.url));
    if (card.ok) {
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
  }
  const page = await env.ASSETS.fetch(request);
  const response = new Response(page.body, page);
  response.headers.append("Vary", "User-Agent");
  return response;
}

export default {
  // Matching static assets never reach the Worker, except "/", which runs
  // the Worker first (run_worker_first in wrangler.jsonc) so terminals can
  // get the plain-text card. Anything else goes back to the assets (which
  // serve the 404 page).
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/presence") {
      return presence(request, ctx);
    }
    if (pathname === "/") return home(request, env);
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
