// Ментор мен әкімшіге арналған есептер API-і. Рұқсат әр әрекетте серверде тексеріледі.
// GET    /api/reports?type=&stream=&subject=&period=&status=   — тізім
// GET    /api/reports?id=..                                     — бір есеп (толық)
// GET    /api/reports?id=..&revisions=1                         — нұсқалар тарихы
// POST   /api/reports { type, stream_id, subject_id, period:{month,week}|{test_date,label}, scope, teacher_id, data }
// PUT    /api/reports { id, version, data, teacher_id, publish? }  — сақтау (version сәйкес келмесе 409)
// POST   /api/reports?action=publish|unpublish|restore { id, version, revisionId? }
// DELETE /api/reports?id=..                                     — тек жоба күйіндегі есеп, тек әкімші
import { route } from '../lib/route.js';
import { readBody, httpError } from '../lib/http.js';
import { requireUser, assertCanEdit } from '../lib/auth.js';
import { listReports, getReport, createReport, updateReport, publishReport, unpublishReport, restoreRevision, reportRevisions, deleteReport } from '../lib/repo.js';

const EDITORS = ['admin', 'mentor'];

export default route({
  async GET(req, res, q) {
    await requireUser(req, EDITORS);
    const id = q.get('id');
    if (id) {
      const rep = await getReport(id);
      if (!rep) throw httpError(404, 'Есеп табылмады.');
      if (q.get('revisions') === '1') return { revisions: await reportRevisions(id) };
      return { report: rep };
    }
    return { reports: await listReports({ type: q.get('type'), stream: q.get('stream'), subject: q.get('subject'), period: q.get('period'), status: q.get('status') }) };
  },
  async POST(req, res, q) {
    const user = await requireUser(req, EDITORS);
    const body = await readBody(req, 3_000_000);
    const action = q.get('action');
    if (!action) return createReport(user, body);
    if (action === 'publish') return { report: await publishReport(user, String(body.id), body.version) };
    if (action === 'unpublish') return { report: await unpublishReport(user, String(body.id), body.version) };
    if (action === 'restore') {
      if (user.role !== 'admin') throw httpError(403, 'Нұсқаны қалпына келтіру — әкімшінің әрекеті.', 'forbidden');
      return { report: await restoreRevision(user, String(body.id), Number(body.revisionId), body.version) };
    }
    throw httpError(400, 'Белгісіз әрекет.');
  },
  async PUT(req) {
    const user = await requireUser(req, EDITORS);
    const body = await readBody(req, 3_000_000);
    if (!body.id) throw httpError(400, 'Есеп id-і жоқ.');
    if (body.version == null) throw httpError(400, 'Нұсқа нөмірі (version) жоқ.');
    return updateReport(user, String(body.id), body);
  },
  async DELETE(req, res, q) {
    const user = await requireUser(req, ['admin']);
    const rep = await getReport(String(q.get('id') || ''));
    if (!rep) throw httpError(404, 'Есеп табылмады.');
    assertCanEdit(user, rep);
    return deleteReport(user, rep.id);
  },
});
