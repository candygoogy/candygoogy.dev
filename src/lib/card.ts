// The plain-text cards for terminals (`curl candygoogy.dev`, `/fettle`,
// `/idiff`), written at build time from the site's own data: every line
// already appears on the site. The Worker serves them to curl, Wget,
// HTTPie and xh (worker/index.ts). At most 72 columns, no colors, plain
// layout.
import type { CollectionEntry } from "astro:content";
import { builtOn, shortCommit } from "./build";
import { release } from "./projects";

export const WIDTH = 72;

// Greedy word wrap to WIDTH columns. Every line after the first starts
// with indent; the first starts with first (both count toward the width).
export function wrap(text: string, indent = "", first = ""): string {
  const lines: string[] = [];
  let line = first;
  for (const word of text.split(" ")) {
    if (line.trim() && (line + " " + word).length > WIDTH) {
      lines.push(line);
      line = indent + word;
    } else {
      line = line.trim() ? `${line} ${word}` : line + word;
    }
  }
  if (line.trim()) lines.push(line);
  return lines.join("\n");
}

export const heading = (text: string) => `${text}\n${"-".repeat(text.length)}`;

export const title = (text: string) => `${text}\n${"=".repeat(text.length)}`;

// Label and value in two columns, the values lined up after the longest
// label.
export function columns(rows: [string, string][]): string {
  const col = Math.max(...rows.map(([label]) => label.length)) + 3;
  return rows
    .map(([label, value]) => label + " ".repeat(col - label.length) + value)
    .join("\n");
}

// The footer stamp's words: when this build was made, and from which
// commit.
export const stamp = () =>
  shortCommit
    ? `Built ${builtOn.label} from ${shortCommit}`
    : `Built ${builtOn.label}`;

export const textResponse = (body: string) =>
  new Response(`\n${body}\n\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

// A product's card: its page in plain text. The name and its line, what
// it is, what it checks, the facts, and where to get it, all in the
// page's own words.
export function productCard(project: CollectionEntry<"projects">): string {
  const { data } = project;
  const page = data.page;
  if (!page) throw new Error(`projects/${project.id}.md has no page: section`);
  const { version, get } = release(project);

  const checks = page.checks
    .map((c) => `${c.name}\n${wrap(c.text, "  ", "  ")}`)
    .join("\n\n");

  const facts: [string, string][] = [];
  if (version) facts.push(["Version", version]);
  if (data.runsOn) facts.push(["Runs on", data.runsOn]);
  if (data.command) facts.push(["Command", data.command]);
  if (data.license) facts.push(["License", data.license]);

  const links: [string, string][] = [];
  if (get) links.push([`Get ${data.name}`, get]);
  if (data.links.source) links.push(["Source on GitHub", data.links.source]);

  return [
    title(data.name),
    wrap(data.blurb),
    wrap(data.summary),
    heading("What it checks"),
    checks,
    ...(page.checksNote ? [wrap(page.checksNote)] : []),
    ...(facts.length ? [columns(facts)] : []),
    ...(links.length ? [columns(links)] : []),
    stamp(),
  ].join("\n\n");
}
