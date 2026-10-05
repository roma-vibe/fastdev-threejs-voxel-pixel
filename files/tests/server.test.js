import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { staticServer } from '../scripts/serve.mjs';
import { projectEnv, port } from '../scripts/env.mjs';
it('serves production routes, correct MIME, missing assets and blocks traversal', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voxel-http-'));
  await writeFile(join(dir, 'index.html'), '<main>demo</main>');
  const server = staticServer(dir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(url + '/adventure');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('demo');
    expect((await fetch(url + '/missing.js')).status).toBe(404);
    expect((await fetch(url + '/%2e%2e%2fsecret.txt')).status).toBe(403);
    expect((await fetch(url + '/%invalid')).status).toBe(400);
    expect((await fetch(url, { method: 'POST' })).status).toBe(405);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true });
  }
});
it('reads project names literally, including quotes, Cyrillic and dollars', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'voxel-env-'));
  const file = join(dir, '.env');
  const name = 'Test "Shop" Магазин $5';
  // Exported variables win over .env (the Docker dev container exports it); test the file itself.
  const exported = process.env.APP_NAME;
  delete process.env.APP_NAME;
  try {
    await writeFile(file, `APP_NAME='${name}'\nWEB_PORT=54123\n`);
    expect(projectEnv(file).APP_NAME).toBe(name);
    expect(port('54123')).toBe(54123);
    expect(() => port('wrong')).toThrow();
    await writeFile(file, 'APP_NAME="Tom\'s \\"Shop\\" C:\\\\Games $5"\n');
    expect(projectEnv(file).APP_NAME).toBe('Tom\'s "Shop" C:\\Games $5');
  } finally {
    if (exported !== undefined) process.env.APP_NAME = exported;
    await rm(dir, { recursive: true });
  }
});
