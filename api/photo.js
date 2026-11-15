// GET  /api/photo?id=..                  — жүктелген мұғалім фотосы
// POST /api/photo { teacherId, dataUrl } — әкімші фото жүктейді (браузер кішірейтіп жібереді)
import { route } from '../lib/route.js';
import { readBody, httpError } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { audit, newId } from '../lib/repo.js';

const MAGIC = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };

export default route({
  async GET(req, res, q) {
    const id = String(q.get('id') || '');
    if (!/^ph_[a-f0-9]{12}$/.test(id)) throw httpError(404, 'Фото табылмады.', 'not_found');
    const d = await db();
    const row = (await d.query('select content_type, body from photos where id = $1', [id])).rows[0];
    if (!row) throw httpError(404, 'Фото табылмады.', 'not_found');
    res.statusCode = 200;
    res.setHeader('Content-Type', row.content_type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(Buffer.from(row.body));
  },
  async POST(req) {
    const user = await requireUser(req, ['admin']);
    const { teacherId, dataUrl } = await readBody(req, 3_000_000);
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw httpError(400, 'Сурет JPG, PNG немесе WEBP болуы керек.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 1_500_000) throw httpError(413, 'Сурет тым үлкен (1,5 МБ-тан аспасын).');
    if (!MAGIC[m[1]].every((b, i) => buf[i] === b)) throw httpError(400, 'Сурет файлы бүлінген.');
    const d = await db();
    return d.tx(async (q) => {
      const t = (await q.query('select * from teachers where id = $1', [String(teacherId || '')])).rows[0];
      if (!t) throw httpError(400, 'Мұғалім табылмады.');
      const id = newId('ph');
      await q.query('insert into photos (id, teacher_id, content_type, body) values ($1,$2,$3,$4)', [id, t.id, m[1], buf]);
      const url = `/api/photo?id=${id}`;
      await q.query('update teachers set photo = $2, updated_at = now() where id = $1', [t.id, url]);
      await audit(q, user.username, 'teachers', t.id, 'photo', { photo: t.photo }, { photo: url });
      return { url };
    });
  },
});
