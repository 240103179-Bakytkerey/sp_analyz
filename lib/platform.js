// JUZ40 платформасының (api.juz40-edu.kz) оқу адаптері.
// Бастапқы көзі: anonens/analysis репозиторийі, src/lib/platform.ts (тармақ claude/peaceful-hamilton-hrall3).
// TypeScript типтері алынып, JS-ке айналдырылды; логика өзгертілмеді. Тек оқу (GET) сұраныстары,
// кіру — жалғыз POST. Логин/құпиясөз тек JUZ40_LOGIN / JUZ40_PASSWORD айнымалыларында.
// Тесттер үшін JUZ40_API_URL арқылы жалған серверге бағыттауға болады.
import { createHash } from "node:crypto";
import { richQuestion } from "./mathml.js";
export class PlatformError extends Error {
}
const base = ()=>(process.env.JUZ40_API_URL || "https://api.juz40-edu.kz").replace(/\/$/, "");
export const platformConfigured = ()=>!!process.env.JUZ40_LOGIN && !!process.env.JUZ40_PASSWORD;
let session = null;
function jwtExp(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        return typeof payload.exp === "number" ? payload.exp * 1000 : Date.now() + 10 * 60_000;
    } catch  {
        return Date.now() + 10 * 60_000;
    }
}
async function signIn() {
    if (!platformConfigured()) {
        throw new PlatformError("Платформа аккаунты бапталмаған: JUZ40_LOGIN және JUZ40_PASSWORD орнатыңыз.");
    }
    const res = await fetch(`${base()}/v1/auth/signin`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "accept-language": "kz"
        },
        body: JSON.stringify({
            username: process.env.JUZ40_LOGIN,
            password: process.env.JUZ40_PASSWORD
        }),
        cache: "no-store"
    });
    const body = await res.json().catch(()=>({}));
    if (!res.ok || typeof body.token !== "string") {
        throw new PlatformError(res.status === 400 || res.status === 401 ? "Платформаға кіру мүмкін болмады: логин не құпиясөз қате." : `Платформаға кіру мүмкін болмады (${res.status}).`);
    }
    const roles = body.roles ?? [];
    if (!roles.some((r)=>r === "HEAD_TEACHER" || r === "ADMIN")) {
        throw new PlatformError(`Бұл аккаунттың рөлі (${roles.join(", ") || "белгісіз"}) жеткіліксіз: HEAD_TEACHER керек.`);
    }
    session = {
        token: body.token,
        exp: jwtExp(body.token)
    };
    return body.token;
}
async function token() {
    if (session && session.exp - 60_000 > Date.now()) return session.token;
    return signIn();
}
async function get(path, retried = false) {
    const res = await fetch(`${base()}${path}`, {
        headers: {
            authorization: `Bearer ${await token()}`,
            "accept-language": "kz"
        },
        cache: "no-store"
    });
    if (res.status === 401 && !retried) {
        session = null;
        return get(path, true);
    }
    if (!res.ok) throw new PlatformError(`Платформа қатесі (${res.status}): ${path.split("?")[0]}`);
    return res.json();
}
async function pool(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({
        length: Math.min(limit, items.length)
    }, async ()=>{
        while(next < items.length){
            const i = next++;
            out[i] = await fn(items[i]);
        }
    }));
    return out;
}
function rich(source) {
    const r = richQuestion(source);
    return r.safeHtml ? {
        text: r.text,
        html: r.safeHtml
    } : {
        text: r.text
    };
}
const imageUrl = (u)=>u && /^https?:\/\//.test(u.trim()) ? u.trim() : null;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
function htmlImages(html, sink) {
    const out = [];
    for (const m of (html ?? "").matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)){
        const src = m[1].trim();
        const data = src.match(/^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/i);
        if (data) {
            const b64 = data[2].replace(/\s+/g, "");
            if (b64.length * 0.75 > MAX_IMAGE_BYTES) continue;
            const hash = createHash("sha256").update(b64).digest("hex").slice(0, 32);
            sink.set(hash, {
                hash,
                mime: data[1].toLowerCase(),
                data: b64
            });
            out.push(`img:${hash}`);
        } else if (/^https?:\/\//i.test(src)) {
            out.push(src);
        }
    }
    return out;
}
function toTask(q, n, sink) {
    const images = [
        ...htmlImages(q.questionText, sink),
        imageUrl(q.questionImageUrl),
        ...(q.questionImageFileUrls ?? []).map(imageUrl)
    ].filter((x)=>!!x).filter((x, i, a)=>a.indexOf(x) === i);
    const task = {
        q: n,
        type: q.quizQuestionType ?? "",
        level: q.difficultyLevel ?? "",
        score: q.score ?? 0,
        ...rich(q.questionText),
        images
    };
    if (q.answerList?.length) {
        task.options = q.answerList.map((a)=>{
            const img = imageUrl(a.answerImageUrl) ?? htmlImages(a.answerText, sink)[0] ?? null;
            return {
                ...rich(a.answerText),
                correct: !!a.correct,
                ...img ? {
                    image: img
                } : {}
            };
        });
        if (q.several) task.several = true;
    }
    if (q.questions?.length) {
        task.pairs = q.questions.map((left, i)=>{
            const l = richQuestion(left).text;
            const full = richQuestion(q.correctAnswers?.[i]).text;
            const right = full.startsWith(l) ? full.slice(l.length).trim() : full;
            return {
                left: l,
                right
            };
        });
    }
    return task;
}
export async function listCourses(subjectCode) {
    const subjects = await get("/v1/headteacher/subjects");
    const subject = subjects.find((s)=>s.shortName?.trim().toUpperCase() === subjectCode.trim().toUpperCase());
    if (!subject) throw new PlatformError(`Платформада «${subjectCode}» пәні табылмады.`);
    const courses = await get(`/v1/headteacher/subjects/${subject.id}/courses`);
    return courses.sort((a, b)=>(b.year ?? 0) - (a.year ?? 0) || (b.month ?? 0) - (a.month ?? 0) || a.name.localeCompare(b.name));
}
const TYPES = {
    st: "SABAK_TAPSYRU",
    at: "AILYK_TEST"
};
const clip = (s, n = 180)=>s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
const round2 = (n)=>Math.round(n * 100) / 100;
async function weekTopics(groupId, month, weeks) {
    const out = [];
    for (const w of weeks){
        try {
            const { themes } = await get(`/v1/headteacher/groups/${groupId}/themes?month=${month}&week=${w}`);
            for (const t of themes ?? []){
                if (!t.themeName.toUpperCase().includes("ТЕОРИЯЛЫҚ")) continue;
                const lessons = await get(`/v3/headteacher/groups/${groupId}/themes/${t.themeId}/lessons/summary`);
                for (const l of lessons ?? []){
                    const name = l.name.replace(/\s+/g, " ").replace(/\s*\d+\s*-\s*бөлім\s*$/i, "").trim();
                    if (!name || /конспект|практикалық|^№/i.test(name)) continue;
                    if (!out.some((x)=>x.toLowerCase() === name.toLowerCase())) out.push(name);
                }
            }
        } catch  {}
    }
    return out;
}
export async function discoverTests(courseId) {
    const groups = await get(`/v1/headteacher/courses/${courseId}/groups`);
    if (!groups.length) return {
        groups,
        tests: []
    };
    const ref = groups[0].id;
    const tests = [];
    for(let m = 1; m <= 12; m++){
        const res = await pool([
            1,
            2,
            3,
            4
        ], 4, (w)=>get(`/v1/headteacher/groups/${ref}/themes?month=${m}&week=${w}`).then((r)=>({
                    themes: r.themes ?? []
                })).catch(()=>({
                    themes: []
                })));
        if (!res.some((r)=>r.themes.length)) break;
        res.forEach((r, i)=>{
            for (const t of r.themes){
                const name = t.themeName.toUpperCase();
                if (name.includes("САБАҚ ТАПСЫРУ")) tests.push({
                    month: m,
                    week: i + 1,
                    kind: "st",
                    themeName: t.themeName
                });
                else if (name.includes("АЙЛЫҚ ТЕСТ") && !tests.some((x)=>x.kind === "at" && x.month === m)) {
                    tests.push({
                        month: m,
                        week: null,
                        kind: "at",
                        themeName: t.themeName
                    });
                }
            }
        });
    }
    return {
        groups,
        tests
    };
}
export async function fetchTestResult(courseId, kind, month, week, knownGroups) {
    const groups = knownGroups ?? await get(`/v1/headteacher/courses/${courseId}/groups`);
    if (!groups.length) return null;
    const weeksToTry = kind === "st" ? [
        week ?? 1
    ] : [
        4,
        3,
        2,
        1
    ];
    const wanted = (n)=>kind === "st" ? n.toUpperCase().includes("САБАҚ ТАПСЫРУ") : n.toUpperCase().includes("АЙЛЫҚ ТЕСТ");
    const perGroup = await pool(groups, 6, async (g)=>{
        for (const w of weeksToTry){
            const { themes } = await get(`/v1/headteacher/groups/${g.id}/themes?month=${month}&week=${w}`);
            const theme = (themes ?? []).find((t)=>wanted(t.themeName));
            if (!theme) continue;
            const lessons = await get(`/v3/headteacher/groups/${g.id}/themes/${theme.themeId}/lessons/summary`);
            const lesson = lessons.find((l)=>l.ratingTaskType === TYPES[kind]) ?? lessons.find((l)=>l.rating);
            if (!lesson) return null;
            const progresses = await get(`/v2/headteacher/groups/${g.id}/lessons/${lesson.id}/progresses`);
            return {
                group: g,
                lesson,
                progresses
            };
        }
        return null;
    });
    const found = perGroup.filter((x)=>!!x);
    if (!found.length) return null;
    const max = found[0].lesson.maxScore ?? (kind === "at" ? 40 : 20);
    const done = (p)=>p.status === "SUCCESS" && p.score != null;
    const groupRows = found.map(({ group, progresses })=>{
        const scores = progresses.filter(done).map((p)=>p.score);
        return {
            curator: group.curator ? `${group.curator.lastname.trim()} ${group.curator.firstname.trim()}` : group.name,
            score: scores.length ? round2(scores.reduce((a, b)=>a + b, 0) / scores.length) : 0,
            submitted: scores.length,
            total: progresses.length
        };
    }).filter((g)=>g.submitted > 0).sort((a, b)=>b.score - a.score);
    const all = found.flatMap((f)=>f.progresses.filter(done));
    if (!all.length) return null;
    const score = round2(all.reduce((a, p)=>a + p.score, 0) / all.length);
    const info = await get(`/v1/lessons/${found[0].lesson.id}/info`).catch(()=>({
            variants: null
        }));
    const variantLessons = await pool(info.variants ?? [], 4, async (v)=>({
            variant: v.variant,
            questions: (await get(`/v1/lessons/${v.variantedLessonId}`).catch(()=>({
                    questions: []
                }))).questions ?? []
        }));
    const variantOfQuestion = new Map();
    for (const v of variantLessons){
        for (const q of v.questions)variantOfQuestion.set(q.id, {
            variant: v.variant,
            text: richQuestion(q.questionText).text
        });
    }
    const optionIds = new Map();
    for (const v of variantLessons){
        for (const q of v.questions){
            if (q.answerList?.length) optionIds.set(q.id, q.answerList.map((a)=>a.id ?? ""));
        }
    }
    const byVariant = new Map();
    for (const p of all){
        if (!p.quizQuestionIds?.length) continue;
        const key = p.quizQuestionIds.join(",");
        if (!byVariant.has(key)) byVariant.set(key, []);
        byVariant.get(key).push(p);
    }
    const variants = [
        ...byVariant.entries()
    ].map(([key, ps], i)=>{
        const ids = key.split(",");
        const variant = variantOfQuestion.get(ids[0])?.variant ?? i + 1;
        const all = ids.map((qid, qi)=>{
            let answered = 0;
            let wrong = 0;
            const options = optionIds.get(qid) ?? [];
            const picks = options.map(()=>0);
            for (const p of ps){
                const q = p.questionPassingDtos?.find((x)=>x.questionId === qid);
                if (!q) continue;
                answered++;
                if ((q.score ?? 0) < (q.maxScore ?? 0)) wrong++;
                for (const a of q.userAnswers ?? []){
                    const i = a.answerId ? options.indexOf(a.answerId) : -1;
                    if (i >= 0) picks[i]++;
                }
            }
            return {
                q: qi + 1,
                pct: answered ? Math.round(100 * wrong / answered) : 0,
                text: clip(variantOfQuestion.get(qid)?.text ?? ""),
                answered,
                wrong,
                picks
            };
        });
        return {
            variant,
            all,
            n: ps.length
        };
    }).filter((v)=>v.n >= 5).sort((a, b)=>a.variant - b.variant);
    const topWrong = variants.map(({ variant, all })=>({
            variant,
            items: all.filter((x)=>x.answered >= 5).sort((a, b)=>b.pct - a.pct).slice(0, 5).map(({ q, pct, text })=>({
                    q,
                    pct,
                    text
                }))
        })).filter((v)=>v.items.length);
    const questionStats = variants.map(({ variant, all, n })=>({
            variant,
            students: n,
            items: all.map(({ q, pct, answered, wrong, picks })=>({
                    q,
                    pct,
                    answered,
                    wrong,
                    ...picks.length ? {
                        picks
                    } : {}
                }))
        }));
    const variantByFirstQuestion = new Map(variantLessons.map((v)=>[
            v.questions[0]?.id,
            v.variant
        ]));
    const students = found.flatMap(({ group, progresses })=>{
        const curator = group.curator ? `${group.curator.lastname.trim()} ${group.curator.firstname.trim()}` : group.name;
        return progresses.filter(done).map((p)=>{
            const ids = p.quizQuestionIds ?? [];
            const wrong = [];
            const partial = [];
            ids.forEach((qid, qi)=>{
                const q = p.questionPassingDtos?.find((x)=>x.questionId === qid);
                const got = q?.score ?? 0;
                const of = q?.maxScore ?? 0;
                if (got <= 0 && of > 0) wrong.push(qi + 1);
                else if (got < of) partial.push(qi + 1);
            });
            return {
                id: p.studentId ?? "",
                name: `${(p.studentLastname ?? "").trim()} ${(p.studentFirstname ?? "").trim()}`.trim(),
                curator,
                variant: variantByFirstQuestion.get(ids[0]) ?? null,
                score: round2(p.score),
                wrong,
                partial
            };
        });
    });
    const distribution = Array.from({
        length: Math.floor(max) + 1
    }, ()=>0);
    for (const p of all){
        const i = Math.min(distribution.length - 1, Math.max(0, Math.floor(p.score)));
        distribution[i]++;
    }
    const imageSink = new Map();
    const tasks = variantLessons.map((v)=>({
            variant: v.variant,
            questions: v.questions.map((q, i)=>toTask(q, i + 1, imageSink))
        })).filter((v)=>v.questions.length).sort((a, b)=>a.variant - b.variant);
    const topics = await weekTopics(found[0].group.id, month, kind === "st" ? [
        week ?? 1
    ] : [
        1,
        2,
        3,
        4
    ]);
    return {
        topics,
        month,
        week: kind === "st" ? week : null,
        kind,
        lessonName: found[0].lesson.name,
        max,
        score,
        submitted: all.length,
        total: found.reduce((a, f)=>a + f.progresses.length, 0),
        groups: groupRows,
        topWrong,
        questionStats,
        distribution,
        tasks,
        images: [
            ...imageSink.values()
        ],
        students
    };
}
