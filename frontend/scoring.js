// Лёгкий скоринг v0 на фронте.
// Логика 1:1 с ../../Методология_скоринга_единая.md и шкалами Опросник_V0.
//
// Авто-скоринг свободного текста ненадёжен, поэтому балл 1–5 по каждому фактору
// проставляет пользователь (шкалы показаны в UI). Уверенность H/M/L выводится
// автоматически из тегов Ф/О/Д ответов внутри блока фактора.

import { FACTORS, BLOCKS } from "./questionnaire.js";

// Поля-вопросы (с тегами) внутри блока каждого фактора.
const FACTOR_FIELDS = Object.fromEntries(
  Object.keys(FACTORS).map((fid) => {
    const block = BLOCKS.find((b) => b.id === fid);
    const fields = block ? block.fields.filter((f) => f.tag).map((f) => f.id) : [];
    return [fid, fields];
  })
);

// Уверенность фактора по тегам ответов: преобладают Ф → H, О → M, Д/пусто → L.
export function factorConfidence(answers, factorId) {
  const ids = FACTOR_FIELDS[factorId] || [];
  let f = 0,
    o = 0,
    d = 0;
  for (const id of ids) {
    const a = answers[id];
    if (!a || !String(a.text || "").trim()) continue;
    const tag = String(a.tag || "").trim();
    if (tag === "Ф") f++;
    else if (tag === "О") o++;
    else if (tag === "Д") d++;
  }
  const answered = f + o + d;
  if (answered === 0) return "L";
  if (f >= o && f >= d && f > 0) return "H";
  if (o >= d) return "M";
  return "L";
}

// scores: { A:1..5, B:.., C:.., D:.., E:.. } — то, что выставил пользователь.
// Факторы без оценки в расчёт не идут (вес перенормируется).
export function computeScore(answers, scores) {
  const perFactor = [];
  let weighted = 0;
  let usedWeight = 0;

  for (const [fid, meta] of Object.entries(FACTORS)) {
    const s = Number(scores[fid]);
    const conf = factorConfidence(answers, fid);
    const has = Number.isFinite(s) && s >= 1 && s <= 5;
    if (has) {
      weighted += (s / 5) * meta.weight;
      usedWeight += meta.weight;
    }
    perFactor.push({
      id: fid,
      name: meta.name,
      weight: meta.weight,
      score: has ? s : null,
      confidence: conf,
    });
  }

  const total = usedWeight > 0 ? Math.round((weighted / usedWeight) * 100) : null;

  // Предохранитель методологии: балл >3 на догадке (L) — флаг «сначала проверь».
  const overclaim = perFactor.some(
    (f) => f.score != null && f.score > 3 && f.confidence === "L"
  );

  return { total, perFactor, usedWeight, overclaim };
}
