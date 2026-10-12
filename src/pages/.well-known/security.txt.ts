// /.well-known/security.txt (RFC 9116), written at build time, so the
// daily rebuild keeps Expires 180 days ahead (RFC 9116: under a year).
import type { APIRoute } from "astro";
import { site } from "../../data/site";

export const GET: APIRoute = () => {
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  const body = [
    `Contact: mailto:${site.email}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
    "Preferred-Languages: en, it",
    `Canonical: ${site.url}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
