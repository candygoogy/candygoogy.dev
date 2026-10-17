// @ts-check
import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";
import pages from "./scripts/pages.mjs";
import thirdPartyLicenses from "./scripts/third-party-licenses.mjs";

export default defineConfig({
  site: "https://candygoogy.dev",
  output: "static",
  trailingSlash: "never",
  devToolbar: { enabled: false },
  // pages: every step that rewrites the built pages, in one pass over them
  // (scripts/pages.mjs): the page's motion starts after the page has first
  // painted, so drawing the page never waits for it; the scripts written
  // into every page ship minified; each page keeps only the motion lookup
  // rules it uses; and, last, so no step changes a page after it, each
  // page's Content-Security-Policy, from the page as it ships.
  // thirdPartyLicenses: the notices for third-party code in the pages, as
  // /third-party-licenses.txt (scripts/third-party-licenses.mjs).
  integrations: [sitemap(), pages(), thirdPartyLicenses()],
  build: {
    format: "file",
    // The CSS is small: inlining it removes render-blocking requests.
    inlineStylesheets: "always",
  },
  vite: {
    // The project root as an absolute path, for the build-time files read
    // in src/lib (declared in src/env.d.ts). import.meta.url there points
    // into the bundle, and the working directory isn't always the root.
    define: {
      __PROJECT_ROOT__: JSON.stringify(
        fileURLToPath(new URL(".", import.meta.url)),
      ),
    },
  },
  // Newsreader (headings) and Schibsted Grotesk (body and wordmark), both
  // SIL Open Font License 1.1. The subset WOFF2 files and their licenses
  // are committed in src/fonts/, built from the upstream sources by
  // scripts/make-fonts.py (a maintainer tool; the build doesn't run it).
  // Astro serves them from our domain and generates metric-matched
  // fallbacks, so swapping in the web font doesn't shift layout.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Newsreader",
      cssVariable: "--font-display",
      fallbacks: ["serif"],
      options: {
        variants: [
          {
            src: ["./src/fonts/Newsreader-Display.woff2"],
            weight: "500 700",
            style: "normal",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Schibsted Grotesk",
      cssVariable: "--font-text",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: ["./src/fonts/SchibstedGrotesk.woff2"],
            weight: "400 700",
            style: "normal",
          },
        ],
      },
    },
  ],
});
