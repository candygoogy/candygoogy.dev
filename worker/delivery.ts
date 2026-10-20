// The colophon's Delivery row: how this one response reached the visitor,
// written into the page as it streams out. The built page ships the row
// hidden, with empty values; here it gets this response's numbers and
// shows. Without the Worker (astro dev, a plain static server) it stays
// hidden.

import { COLOS } from "./colos.ts";

/** The row's lines, by their data-delivery names in colophon.astro. */
export type Lines = { city: string; rtt: string; protocol: string };

const PROTOCOL = /^HTTP\/[0-9.]+$/;
// A no-break space keeps the number with its unit.
const NBSP = "\u00a0";

/** Where this response comes from: the city of the Cloudflare data center
 * that answered (request.cf.colo, an airport code), Cloudflare's own
 * measure of the round trip to the visitor, and the HTTP version they came
 * in on. Nothing about the visitor themselves (request.cf.city would be
 * where they are), and nothing kept. A line it has no value for is empty;
 * without the city there's no row at all (null). */
export function lines(cf: Request["cf"]): Lines | null {
  const colo = typeof cf?.colo === "string" ? cf.colo : "";
  if (!/^[A-Z]{3}$/.test(colo)) return null;
  // TCP's round trip, or QUIC's on HTTP/3 (0 when it's the other one).
  // clientQuicRtt is documented but not yet in the types, hence the cast:
  // https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties
  const quic = (cf as { clientQuicRtt?: unknown } | undefined)?.clientQuicRtt;
  const rtt = [cf?.clientTcpRtt, quic].find(
    (ms): ms is number => typeof ms === "number" && ms > 0,
  );
  const protocol = cf?.httpProtocol;
  return {
    city: COLOS[colo] ?? colo,
    rtt: rtt === undefined ? "" : `${Math.round(rtt)}${NBSP}ms`,
    protocol:
      typeof protocol === "string" && PROTOCOL.test(protocol) ? protocol : "",
  };
}

/** The colophon, with this response's Delivery row filled in. A HEAD, a
 * request without Cloudflare's data (local), and any answer but a 200 go
 * through as the assets give them. */
export async function colophon(
  request: Request,
  assets: Fetcher,
): Promise<Response> {
  const values = request.method === "GET" ? lines(request.cf) : null;
  if (!values) return assets.fetch(request);

  // The numbers describe this response alone, so a browser must never
  // show an earlier visit's as current: the page is always sent whole
  // (never a 304 that would keep the old copy), with no validators to
  // revalidate against, and kept only by the browser, which asks again
  // each time it shows it. no-cache, not no-store, so the back/forward
  // cache still keeps the page you left.
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  const page = await assets.fetch(new Request(request, { headers }));
  if (page.status !== 200) return page;

  // setInnerContent writes text, escaped, not HTML.
  const rewriter = new HTMLRewriter().on("#delivery", {
    element(row) {
      row.removeAttribute("hidden");
    },
  });
  for (const [name, value] of Object.entries(values)) {
    const line = `#delivery [data-delivery="${name}"]`;
    rewriter.on(line, {
      element(el) {
        if (!value) el.remove();
      },
    });
    if (value) {
      rewriter.on(`${line} > dd`, {
        element(el) {
          el.setInnerContent(value);
        },
      });
    }
  }
  const filled = rewriter.transform(page);
  const response = new Response(filled.body, filled);
  response.headers.delete("ETag");
  response.headers.delete("Last-Modified");
  response.headers.set("Cache-Control", "private, no-cache");
  return response;
}
