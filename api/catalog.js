// GET    /api/catalog                         — анықтамалық (кез келген кірген адам; PUBLIC_VIEW=1 болса — бәріне)
// POST   /api/catalog { kind, item }          — қосу/өзгерту (тек әкімші; кезеңді ментор да қоса алады)
// DELETE /api/catalog?kind=..&id=..           — өшіру (тек әкімші; қолданыстағы жазба өшпейді)
import { route } from '../lib/route.js';
import { readBody, httpError } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { getCatalog, saveEntity, deleteEntity } from '../lib/repo.js';

const KINDS = ['subjects', 'streams', 'combinations', 'teachers', 'assignments', 'periods'];

export default route({
  async GET(req) {
    const user = await requireUser(req, null, { allowAnonymous: true });
    const c = await getCatalog();
    if (!user || user.role === 'viewer') {
      // Көрушіге ішкі импорт кодтары керек емес.
      c.subjects = c.subjects.map(({ sapaline_code, platform_code, ...s }) => s);
      c.teachers = c.teachers.map(({ aliases, ...t }) => t);
    }
    return c;
  },
  async POST(req) {
    const body = await readBody(req, 200_000);
    const kind = String(body.kind || '');
    if (!KINDS.includes(kind)) throw httpError(400, 'Белгісіз анықтамалық.');
    const user = await requireUser(req, kind === 'periods' ? ['admin', 'mentor'] : ['admin']);
    return { item: await saveEntity(user, kind, body.item || {}) };
  },
  async DELETE(req, res, q) {
    const user = await requireUser(req, ['admin']);
    const kind = q.get('kind');
    if (!KINDS.includes(kind)) throw httpError(400, 'Белгісіз анықтамалық.');
    return deleteEntity(user, kind, String(q.get('id') || ''));
  },
});
