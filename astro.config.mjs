// @ts-check
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { defineConfig, fontProviders } from "astro/config";

export default defineConfig({
  site: "https://candygoogy.dev",
  output: "static",
  trailingSlash: "never",
  devToolbar: { enabled: false },
  integrations: [svelte(), sitemap()],
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
