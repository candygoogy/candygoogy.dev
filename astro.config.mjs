// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";
import inlineScripts from "./scripts/inline-scripts.mjs";
import motionLoader from "./scripts/motion-loader.mjs";

export default defineConfig({
  site: "https://candygoogy.dev",
  output: "static",
  trailingSlash: "never",
  devToolbar: { enabled: false },
  // motionLoader: the page's motion starts after the page has first
  // painted, so drawing the page never waits for it (scripts/motion-loader.mjs).
  // inlineScripts: the scripts written into every page ship minified
  // (scripts/inline-scripts.mjs).
  integrations: [sitemap(), motionLoader(), inlineScripts()],
  build: {
    format: "file",
    // The CSS is small: inlining it removes render-blocking requests.
    inlineStylesheets: "always",
  },
  // The official, unmodified WOFF2 files fetched by `npm run fonts` (see
  // scripts/fonts.mjs). Astro serves them from our domain and generates
  // metric-matched fallbacks, so swapping in the web font doesn't shift layout.
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Cabinet Grotesk",
      cssVariable: "--font-display",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: ["./src/fonts/CabinetGrotesk-Variable.woff2"],
            weight: "100 900",
            style: "normal",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Satoshi",
      cssVariable: "--font-text",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: ["./src/fonts/Satoshi-Variable.woff2"],
            weight: "300 900",
            style: "normal",
          },
        ],
      },
    },
  ],
});
