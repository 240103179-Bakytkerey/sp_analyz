// POST /api/ack { reportId } — «Таныстым»: кім, қай есеппен, қай жарияланған нұсқамен, қашан.
import { route } from '../lib/route.js';
import { readBody, httpError } from '../lib/http.js';
import { requireUser } from '../lib/auth.js';
import { acknowledge } from '../lib/repo.js';

export default route({
  async POST(req) {
    const user = await requireUser(req, null);
    const { reportId } = await readBody(req, 10_000);
    if (!reportId) throw httpError(400, 'Есеп көрсетілмеген.');
    return acknowledge(user, String(reportId));
  },
});
