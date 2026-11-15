// GET /api/view?type=ls|st|bt&stream=sp1|all&subject=chemistry|all&period=5-2&combo=all|c_bh[&drafts=1]
// Жарияланған есептер және олардың динамикасы. drafts=1 — тек ментор/әкімшіге (жобаны алдын ала қарау).
import { route } from '../lib/route.js';
import { requireUser } from '../lib/auth.js';
import { buildView } from '../lib/view.js';

export default route({
  async GET(req, res, q) {
    const user = await requireUser(req, null, { allowAnonymous: true });
    const drafts = q.get('drafts') === '1' && user && (user.role === 'mentor' || user.role === 'admin');
    return buildView({
      type: q.get('type'), stream: q.get('stream'), subject: q.get('subject'), period: q.get('period'), combo: q.get('combo'),
      drafts, user,
    });
  },
});
