// A small static server for the built site (dist/), on a free port. The
// pages are built as files (about.html for /about), as the assets binding
// serves them; the Worker isn't needed for what these tests open.
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const isFile = (path) => existsSync(path) && statSync(path).isFile();

function find(pathname) {
  const path = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return undefined;
  for (const candidate of [path, `${path}.html`, join(path, "index.html")]) {
    if (isFile(candidate)) return candidate;
  }
  return undefined;
}

/** Serves dist/; resolves to { url, close }. `headers` adds response
 * headers by path, as the Worker does for some pages ({ "/colophon":
 * { "Server-Timing": … } }); it's read on every request, so a test can
 * change it between pages. */
export async function serve({ headers = {} } = {}) {
  if (!isFile(join(ROOT, "index.html"))) {
    throw new Error("dist/index.html is missing: run `npm run build` first");
  }
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    let file;
    try {
      file = find(pathname);
    } catch (error) {
      // A malformed escape (/%E0%A4%A): a bad request, not a dead server.
      if (!(error instanceof URIError)) throw error;
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : "Bad request\n");
      return;
    }
    const status = file ? 200 : 404;
    const path = file ?? join(ROOT, "404.html");
    res.writeHead(status, {
      "Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
      ...headers[pathname],
    });
    res.end(req.method === "HEAD" ? undefined : await readFile(path));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise((done) => {
        server.closeAllConnections();
        server.close(done);
      }),
  };
}
