import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
// Values containing a single quote are double-quoted with \\, \" and \n escapes; undo them exactly.
export function projectEnv(path = '.env') {
  let file = {};
  try {
    const text = readFileSync(path, 'utf8');
    file = parseEnv(text);
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z_0-9]*)="(.*)"\s*$/);
      if (match) file[match[1]] = match[2].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c));
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return { ...file, ...process.env };
}
export function port(value, fallback = 5173) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535)
    throw new Error('WEB_PORT must be an integer from 1 to 65535');
  return n;
}
