// Тест көмекшілері: API функцияларын нақты HTTP серверсіз шақыру және уақытша дерекқор.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

export function tempDbDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sp-test-'));
}

export async function call(handler, { method = 'GET', url = '/', body, cookie } = {}) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: 'test.local', ...(cookie ? { cookie } : {}), ...(method !== 'GET' ? { origin: 'http://test.local' } : {}) };
  req.socket = { remoteAddress: '127.0.0.1' };
  const headers = {};
  let resolve;
  const done = new Promise((r) => (resolve = r));
  const res = {
    statusCode: 200,
    writableEnded: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    end(data) { this.writableEnded = true; resolve(data); },
  };
  await handler(req, res);
  const data = await done;
  let json = null;
  try { json = JSON.parse(String(data)); } catch {}
  const setCookie = headers['set-cookie'];
  return { status: res.statusCode, body: json, raw: data, headers, cookie: setCookie ? String(setCookie).split(';')[0] : null };
}

export async function api() {
  const names = ['session', 'view', 'catalog', 'reports', 'ack', 'users', 'import', 'audit', 'photo'];
  const out = {};
  for (const n of names) out[n] = (await import(`../api/${n}.js`)).default;
  return out;
}
