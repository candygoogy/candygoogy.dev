// The Atom feed's pure parts (src/pages/feed.xml.ts writes it): which
// entries it carries, in what order, and the XML. No imports, so the unit
// tests load it as it is.

export interface Entry {
  title: string;
  // The entry's page; also its id, which never changes.
  url: string;
  // RFC 3339.
  updated: string;
  summary: string;
}

export const MAX_ENTRIES = 30;

// Newest first (same time: by title, so the order never flips between
// builds), at most max of them.
export function newestFirst(entries: Entry[], max = MAX_ENTRIES): Entry[] {
  return [...entries]
    .sort(
      (a, b) =>
        Date.parse(b.updated) - Date.parse(a.updated) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, max);
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);

// "2026-10-15T00:00:00.000Z" as "2026-10-15T00:00:00Z".
export const rfc3339 = (date: Date) =>
  date.toISOString().replace(/\.\d{3}Z$/, "Z");

/** The feed: its updated time is the newest entry's, not the build's, so
 * a daily rebuild with nothing new leaves it as it was. */
export function atom(feed: {
  title: string;
  site: string;
  self: string;
  author: string;
  entries: Entry[];
}): string {
  const entries = newestFirst(feed.entries);
  const newest = entries[0];
  if (!newest) throw new Error("feed: no entries");
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escape(feed.title)}</title>`,
    `  <link rel="self" type="application/atom+xml" href="${escape(feed.self)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escape(feed.site)}"/>`,
    `  <id>${escape(feed.self)}</id>`,
    `  <updated>${newest.updated}</updated>`,
    `  <author><name>${escape(feed.author)}</name><uri>${escape(feed.site)}</uri></author>`,
    ...entries.flatMap((e) => [
      "  <entry>",
      `    <title>${escape(e.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${escape(e.url)}"/>`,
      `    <id>${escape(e.url)}</id>`,
      `    <updated>${e.updated}</updated>`,
      `    <summary>${escape(e.summary)}</summary>`,
      "  </entry>",
    ]),
    "</feed>",
  ];
  return `${lines.join("\n")}\n`;
}
