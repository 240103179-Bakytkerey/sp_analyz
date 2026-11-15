// API маршрутының ортақ қаңқасы: әдіс бойынша таратады, қатені біркелкі JSON-ға айналдырады,
// өзгерту сұраныстарын тек сайттың өзінен қабылдайды.
import { send, fail, httpError, sameOrigin } from './http.js';
import { ensureBootstrapAdmin } from './auth.js';

let bootstrapped = null;

export function route(handlers) {
  return async function handler(req, res) {
    try {
      if (!bootstrapped) bootstrapped = ensureBootstrapAdmin().catch((e) => { bootstrapped = null; throw e; });
      await bootstrapped;
      const fn = handlers[req.method];
      if (!fn) {
        res.setHeader('Allow', Object.keys(handlers).join(', '));
        throw httpError(405, 'Бұл әдіске рұқсат жоқ.');
      }
      if (req.method !== 'GET' && !sameOrigin(req)) throw httpError(403, 'Рұқсат жоқ.');
      const url = new URL(req.url, 'http://local');
      const out = await fn(req, res, url.searchParams);
      if (out !== undefined && !res.writableEnded) send(res, 200, out);
    } catch (e) {
      fail(res, e);
    }
  };
}
