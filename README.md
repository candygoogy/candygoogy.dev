<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/wordmark-dark.png">
    <img src=".github/assets/wordmark-light.png" alt="candygoogy.dev" width="393">
  </picture>
</p>

<p align="center"><b>The source of candygoogy's portfolio: the things I build, and the person who builds them.</b></p>

<p align="center">
  <a href="https://candygoogy.dev">Website</a> ·
  <a href="https://fettle.page">Fettle</a> ·
  <a href="mailto:hello@candygoogy.dev">hello@candygoogy.dev</a>
</p>

<p align="center">
  <a href="https://github.com/candygoogy/candygoogy.dev/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/candygoogy/candygoogy.dev/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Code: MIT" src="https://img.shields.io/badge/code-MIT-3651d4"></a>
  <img alt="Built with Astro" src="https://img.shields.io/badge/built%20with-Astro-3651d4">
</p>

A small static site that shows what I've made, starting with [Fettle](https://fettle.page), and makes it easy to get in touch.

Every page is plain HTML and CSS, built ahead of time; JavaScript only adds motion and small extras, and the content is all there without it. There are no analytics, trackers or cookies. Light and dark themes follow your system and remember your pick. It's built to WCAG 2.2 AA, works by keyboard alone, and keeps still when your system asks for reduced motion.

## How it's built

- **Site:** [Astro](https://astro.build), static output. A small theme script runs before the first paint, so the page never flashes the wrong theme; the rest of the interactive parts are small TypeScript scripts that load after it.
- **Hosting:** Cloudflare Workers static assets, on the apex domain only.
- **Deploys:** Workers Builds, from this repo's `deploy` branch, only once lint, typecheck and the unit tests pass (`npm run build:deploy`). CI moves `deploy` up to `main` only after every check on it has passed, the browser tests included.
- **Type:** Newsreader and Schibsted Grotesk, both under the SIL Open Font License (see [Fonts](#fonts)).
- **Discord status:** a small Worker route (`/api/presence`) asks [Lanyard](https://github.com/Phineas/lanyard) server-side and returns only online, idle, do not disturb or offline. Visitors' browsers only ever talk to candygoogy.dev.
- **Checks:** ESLint, Prettier and `astro check` on every push, in [CI](.github/workflows/ci.yml).

```text
src/
  content/projects/   one Markdown file per project
  content.config.ts   the schema every project must match
  layouts/            the page shell
  pages/              home, /fettle and the 404
scripts/make-fonts.py builds the fonts in src/fonts/ (the build doesn't run it)
scripts/wordmark.mjs  draws this README's wordmark images (npm run wordmark)
wrangler.jsonc        Cloudflare config (no account details)
```

## Develop

Requires Node 22.18 or newer (Workers Builds and CI use the version in `.node-version`).

```sh
npm ci
npm run dev        # the Astro dev server
npm run lint       # ESLint + Prettier check (never rewrites files)
npm run typecheck  # astro check, then tsc on the Worker
npm run build      # static output in dist/
npm run build:deploy  # lint, typecheck and unit tests, then build (Workers Builds runs this)
npm run preview    # serve dist/ locally with Wrangler, as on Cloudflare
```

`npm run format` rewrites files with Prettier. It only runs when you call it.

### Adding a project

Projects live in `src/content/projects/`, one Markdown file each. The schema in `src/content.config.ts` fails the build on a missing or wrong field, so a broken entry never ships. My own projects can carry screenshots; websites built for clients are text only, and the build enforces that too.

## Fonts

Headings are set in [Newsreader](https://github.com/productiontype/Newsreader) by Production Type, and body text and the wordmark in [Schibsted Grotesk](https://github.com/schibsted/schibsted-grotesk) by Schibsted Media Group. Both are under the [SIL Open Font License 1.1](https://openfontlicense.org), so the WOFF2 files are committed in `src/fonts/`, each next to its license (`OFL-Newsreader.txt`, `OFL-SchibstedGrotesk.txt`). `scripts/make-fonts.py` builds them from the upstream files in google/fonts, pinned to one commit: Newsreader at one optical size, both cut to the weights and characters the site uses. The build never runs it. Astro serves the files from this domain, and `/third-party-licenses.txt` carries both licenses.

## License

- **Code** (everything that makes the site work) is under the [MIT License](LICENSE).
- The **fonts** in `src/fonts/` are under the SIL Open Font License 1.1 (see [Fonts](#fonts)).
- **Content** (the writing, project descriptions, screenshots, images, logos and the candygoogy name and identity) is **© candygoogy, all rights reserved**. It isn't covered by the MIT License, so please don't reuse it without asking.
- The **avatar** artwork (contact card and site icon) is by [@dark_night1109](https://x.com/dark_night1109/status/2104328383211737219). It belongs to the artist and isn't covered by the © candygoogy content line or the MIT License. The avatar comes from the GitHub profile at build time; update this credit if it changes.
- The **Fettle** marks and screenshots belong to the Fettle project. Third-party names and sites mentioned here belong to their owners.
