/**
 * Test-only static server for the chat browser harness. Bundles the entry with esbuild into the
 * scratch directory and serves HTML/JS/CSS on loopback only. It never serves /api routes: the browser
 * fixtures answer every API call locally. No auth, no database, no production route.
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';

const here = __dirname;
const root = path.resolve(here, '../..');
export const CHAT_ATTACH_PORT = Number(process.env.CHAT_ATTACH_PORT ?? 3417);
const scratchRoot = process.env.CHAT_ATTACH_SCRATCH ?? path.join(os.tmpdir(), 'chat-attach');
export const outDir = path.join(scratchRoot, `port-${CHAT_ATTACH_PORT}`, 'bundle');

const HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chat simulated device harness</title>
    <link rel="stylesheet" href="/bundle.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="/bundle.js"></script>
  </body>
</html>`;

export async function buildBundle(): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), HTML);
  await esbuild.build({
    entryPoints: [path.join(root, 'tests/support/chat-browser-entry.tsx')],
    bundle: true,
    outdir: outDir,
    entryNames: 'bundle',
    format: 'iife',
    target: 'es2022',
    jsx: 'automatic',
    sourcemap: false,
    logLevel: 'warning',
    define: {
      'process.env.NODE_ENV': '"development"',
      'process.env.NEXT_PUBLIC_ROOT_DOMAIN': '"tulzo.test"',
    },
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.eot': 'file' },
  });
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export function startServer(port = CHAT_ATTACH_PORT): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}');
      return;
    }
    const name = path.extname(pathname) ? pathname.slice(1) : 'index.html';
    const file = path.join(outDir, path.normalize(name));
    if (!file.startsWith(outDir) || !fs.existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  buildBundle()
    .then(() => startServer())
    .then(() => console.log(`chat-attach harness on http://127.0.0.1:${CHAT_ATTACH_PORT} (bundle ${outDir})`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
