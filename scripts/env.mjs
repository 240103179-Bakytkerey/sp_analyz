// .env.local / .env файлдарын process.env-ге жүктейді (тек компьютерде іске қосқанда).
import fs from 'node:fs';
import path from 'node:path';
export function loadEnv(root) {
  for (const f of ['.env.local', '.env']) {
    let text = '';
    try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in process.env) && m[2] !== '') process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}
