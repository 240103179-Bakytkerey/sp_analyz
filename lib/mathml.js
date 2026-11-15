// Платформа есептерінің HTML-ін (MathML формулалармен) қауіпсіз түрге келтіру.
// Бастапқы көзі: anonens/analysis, src/lib/mathml.ts — типтері алынып, JS-ке айналдырылды.
const MATH_TAGS = new Set([
    "math",
    "mi",
    "mn",
    "mo",
    "mtext",
    "mspace",
    "ms",
    "mrow",
    "msqrt",
    "mroot",
    "mfrac",
    "msup",
    "msub",
    "msubsup",
    "mover",
    "munder",
    "munderover",
    "mtable",
    "mtr",
    "mtd",
    "mstyle",
    "mpadded",
    "mphantom",
    "menclose",
    "mfenced"
]);
const BLOCK = new Set([
    "p",
    "div",
    "li",
    "ul",
    "ol",
    "tr",
    "table",
    "h1",
    "h2",
    "h3",
    "h4"
]);
const VOID = new Set([
    "br",
    "img",
    "hr",
    "mspace",
    "input",
    "meta"
]);
const DROP = new Set([
    "script",
    "style",
    "head",
    "title",
    "iframe",
    "object",
    "svg",
    "annotation",
    "annotation-xml"
]);
const ENTITIES = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    minus: "−",
    times: "×",
    middot: "·",
    deg: "°",
    plusmn: "±",
    le: "≤",
    ge: "≥",
    ne: "≠",
    pi: "π",
    alpha: "α",
    beta: "β",
    gamma: "γ",
    angle: "∠",
    perp: "⊥",
    parallel: "∥",
    radic: "√",
    infin: "∞"
};
function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e)=>{
        if (e[0] === "#") {
            const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
        }
        return ENTITIES[e.toLowerCase()] ?? m;
    });
}
function parse(html) {
    const root = {
        tag: "#root",
        children: []
    };
    const stack = [
        root
    ];
    const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b[^>]*?(\/?)>|([^<]+)|</g;
    let dropDepth = 0;
    for (const m of html.matchAll(re)){
        const [whole, rawTag, selfClose, text] = m;
        if (whole.startsWith("<!--")) continue;
        if (text !== undefined || whole === "<") {
            if (!dropDepth) stack[stack.length - 1].children.push(decode(text ?? "<"));
            continue;
        }
        const tag = rawTag.toLowerCase().replace(/^mml:/, "");
        const closing = whole.startsWith("</");
        if (DROP.has(tag)) {
            if (!closing && !selfClose) dropDepth++;
            else if (closing && dropDepth) dropDepth--;
            continue;
        }
        if (dropDepth) continue;
        if (closing) {
            const i = stack.map((n)=>n.tag).lastIndexOf(tag);
            if (i > 0) stack.length = i;
            continue;
        }
        const node = {
            tag,
            children: []
        };
        stack[stack.length - 1].children.push(node);
        if (!selfClose && !VOID.has(tag)) stack.push(node);
    }
    return root.children;
}
const SUP = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
    "+": "⁺",
    "-": "⁻",
    "−": "⁻",
    n: "ⁿ",
    "∘": "°",
    "○": "°",
    "°": "°"
};
const SUB = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉"
};
const script = (s, map, fallback)=>[
        ...s
    ].every((c)=>map[c]) ? [
        ...s
    ].map((c)=>map[c]).join("") : `${fallback}(${s})`;
const wrap = (s)=>s.length > 1 && !/^[\w.,]+$/u.test(s) ? `(${s})` : s;
function toText(nodes, inMath = false) {
    let out = "";
    for (const n of nodes){
        if (typeof n === "string") {
            out += inMath ? n.trim() || (n.length ? " " : "") : n;
            continue;
        }
        const kids = n.children;
        const t = (i)=>toText(kids[i] ? [
                kids[i]
            ] : [], true).trim();
        switch(n.tag){
            case "br":
                out += "\n";
                break;
            case "img":
                out += " ";
                break;
            case "math":
                out += toText(kids, true);
                break;
            case "msqrt":
                out += `√${wrap(toText(kids, true).trim())}`;
                break;
            case "mroot":
                out += `${script(t(1), SUP, "^")}√${wrap(t(0))}`;
                break;
            case "mfrac":
                out += `${wrap(t(0))}/${wrap(t(1))}`;
                break;
            case "msup":
                out += `${t(0)}${script(t(1), SUP, "^")}`;
                break;
            case "msub":
                out += `${t(0)}${script(t(1), SUB, "_")}`;
                break;
            case "msubsup":
                out += `${t(0)}${script(t(1), SUB, "_")}${script(t(2), SUP, "^")}`;
                break;
            case "mo":
                {
                    const op = toText(kids, true).trim();
                    out += !op ? " " : /^[=<>≤≥≠+−\-×·:∥⊥]$/.test(op) ? ` ${op} ` : op;
                    break;
                }
            case "mtext":
                out += toText(kids, false);
                break;
            default:
                out += BLOCK.has(n.tag) ? `\n${toText(kids, inMath)}\n` : toText(kids, inMath);
        }
    }
    return out;
}
const esc = (s)=>s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// SMART PRO: химиялық формулалар үшін sub/sup және мәтін екпіні де сақталады (атрибутсыз).
const INLINE = new Set(["sub", "sup", "b", "i", "strong", "em"]);
function toSafe(nodes) {
    let out = "";
    for (const n of nodes){
        if (typeof n === "string") {
            out += esc(n);
            continue;
        }
        if (n.tag === "br") out += "<br>";
        else if (n.tag === "math") out += `<math>${toSafe(n.children)}</math>`;
        else if (n.tag === "mo" && !toText(n.children, true).trim()) out += "<mtext>\u00a0</mtext>";
        else if (MATH_TAGS.has(n.tag)) out += `<${n.tag}>${toSafe(n.children)}</${n.tag}>`;
        else if (BLOCK.has(n.tag)) out += `<p>${toSafe(n.children)}</p>`;
        else if (INLINE.has(n.tag)) out += `<${n.tag}>${toSafe(n.children)}</${n.tag}>`;
        else if (n.tag !== "img") out += toSafe(n.children);
    }
    return out;
}
const tidy = (s)=>s.replace(/[​-‏‪-‮﻿]/g, "").replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ ([,.;:!?)])/g, "$1").trim();
export function richQuestion(html) {
    const nodes = parse(html ?? "");
    const text = tidy(toText(nodes));
    const tree = JSON.stringify(nodes);
    const hasMath = tree.includes('"tag":"math"') || /"tag":"su[bp]"/.test(tree);
    return {
        text,
        safeHtml: hasMath ? toSafe(nodes).trim() : null
    };
}
export const tidyMathText = (s)=>s.replace(/\^\(?[∘○°]\)?/g, "°");
