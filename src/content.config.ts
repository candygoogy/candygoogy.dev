import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// One Markdown file per project. Adding a project means adding one file (and,
// for products, one image folder). The build fails on a missing or bad field.
const projects = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/projects" }),
  schema: ({ image }) =>
    z
      .object({
        name: z.string().min(1),
        // One short line for the hero index, under the name (only there).
        blurb: z.string().min(1).max(64),
        // One or two sentences: the band lede or the website row.
        summary: z.string().min(1).max(320),
        // "product" = candygoogy's own work (gets images and a band/page);
        // "side" = a smaller own project (a text row, no page);
        // "website" = built for a client or employer (text row).
        kind: z.enum(["product", "side", "website"]),
        status: z.enum(["live", "in-progress", "archived"]),
        date: z.coerce.date(),
        stack: z.array(z.string().min(1)).min(1),
        role: z.string().min(1).optional(),
        // Fallback only: the build reads the latest release tag when it can.
        version: z.string().min(1).optional(),
        // owner/repo on GitHub, for the latest release tag.
        repo: z
          .string()
          .regex(/^[\w.-]+\/[\w.-]+$/)
          .optional(),
        license: z.string().min(1).optional(),
        runsOn: z.string().min(1).optional(),
        // The command it runs as, when that isn't its name (Install diff
        // is idiff), named once in its facts.
        command: z.string().min(1).optional(),
        story: z
          .object({
            why: z.string().min(1),
            hard: z.string().min(1),
            promise: z.string().min(1),
          })
          .optional(),
        links: z.object({
          live: z.url().optional(),
          source: z.url().optional(),
        }),
        // Screenshots in light and dark; the page shows the one that matches
        // the theme.
        images: z
          .array(
            z.object({
              light: image(),
              dark: image(),
              alt: z.string().min(1),
              caption: z.string().min(1),
              // Optional phone crop (light and dark): a readable detail
              // of the shot, served on narrow screens instead.
              phone: z.object({ light: image(), dark: image() }).optional(),
            }),
          )
          .default([]),
        // A real receipt, shown as an example on a product's page: what was
        // installed, how, and its lines group by group. Each line starts
        // with its mark (✓, ⚠, ✗ or ·) and keeps the receipt's own words.
        receipt: z
          .object({
            title: z.string().min(1),
            how: z.string().min(1).optional(),
            groups: z
              .array(
                z.object({
                  label: z.string().min(1),
                  lines: z.array(z.string().regex(/^[✓⚠✗·] \S/u)).min(1),
                }),
              )
              .min(1),
            caption: z.string().min(1).optional(),
            href: z.url().optional(),
          })
          .optional(),
        // The project page's own sections (products only).
        page: z
          .object({
            checks: z
              .array(
                z.object({ name: z.string().min(1), text: z.string().min(1) }),
              )
              .min(1),
            checksNote: z.string().min(1).optional(),
            uses: z
              .array(
                z
                  .object({
                    text: z.string().min(1),
                    // Index into images: this use's screenshot, shown beside it.
                    shot: z.number().int().min(0).optional(),
                    // A phrase in the text that links out, as written there.
                    link: z
                      .object({ text: z.string().min(1), href: z.url() })
                      .optional(),
                  })
                  .refine((u) => !u.link || u.text.includes(u.link.text), {
                    message: "link.text must appear in text, as written there.",
                    path: ["link", "text"],
                  }),
              )
              .min(1),
            privacy: z.string().min(1),
            // Left out until it's written: the page then shows privacy alone.
            learned: z.string().min(1).optional(),
          })
          .optional(),
        draft: z.boolean().default(false),
      })
      .refine((p) => p.kind === "product" || p.images.length === 0, {
        message: "Only products have images; rows are text only.",
        path: ["images"],
      })
      .refine((p) => p.kind !== "product" || p.story !== undefined, {
        message: "Products need a story (why, hard, promise).",
        path: ["story"],
      }),
});

// One Markdown file per experiment: a small tool on its own subdomain,
// listed on /experiments.
const experiments = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/experiments" }),
  schema: z.object({
    name: z.string().min(1),
    blurb: z.string().min(1).max(64),
    summary: z.string().min(1).max(320),
    url: z.url(),
    // Its folder on GitHub.
    source: z.url(),
    date: z.coerce.date(),
    status: z.enum(["live", "retired"]),
    stack: z.array(z.string().min(1)).min(1),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, experiments };
