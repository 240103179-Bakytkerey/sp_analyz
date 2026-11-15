// GET /api/audit?entity=&id=  — өзгерістер тарихы (тек әкімші); GET /api/audit?runs=1 — импорт іске қосылымдары
import { route } from '../lib/route.js';
import { requireUser } from '../lib/auth.js';
import { auditLog, importRuns } from '../lib/repo.js';

export default route({
  async GET(req, res, q) {
    const user = await requireUser(req, ['admin', 'mentor']);
    if (q.get('runs') === '1') return { runs: await importRuns(40) };
    if (user.role !== 'admin') return { audit: [] };
    return { audit: await auditLog({ entity: q.get('entity') || null, entityId: q.get('id') || null, limit: Number(q.get('limit')) || 200 }) };
  },
});
