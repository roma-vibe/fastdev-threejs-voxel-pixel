import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { projectEnv, port } from './env.mjs';
export function staticServer(root) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
  };
  return createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      let path;
      try {
        path = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      let file = resolve(root, '.' + path);
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const page = path === '/' || !extname(path);
      if (page) file = resolve(root, 'index.html');
      const info = await stat(file);
      if (!info.isFile()) throw Object.assign(new Error('Missing file'), { code: 'ENOENT' });
      // Read before writing headers, so a failed read still gets a proper error response.
      const body = req.method === 'HEAD' ? undefined : await readFile(file);
      res.writeHead(200, {
        'Content-Type': mime[extname(file)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control':
          !page && path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 'ENOENT' ? 404 : 500);
      res.end(e.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = projectEnv(),
    root = resolve('dist');
  await stat(resolve(root, 'index.html'));
  const server = staticServer(root),
    p = port(env.WEB_PORT);
  server.listen(p, '0.0.0.0', () => console.log(`Game running at http://localhost:${p}`));
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => server.close(() => process.exit(0)));
}
