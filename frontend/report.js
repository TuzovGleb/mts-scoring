// Чистые помощники для отчётов (без DOM и без зашифрованного ядра) — поэтому
// модуль тестируется в node. Используется карточкой проекта (projects.js):
//  - buildSynthesisPrompt: промт для сведения отчётов моделей в один (gpt-5.1);
//  - mdToHtml: минимальный markdown → HTML для красивого показа и печати в PDF.

// Факторы по умолчанию (совпадают с FACTORS ядра). Передаются явно из projects.js,
// здесь — фолбэк, чтобы модуль оставался самодостаточным и тестируемым.
export const DEFAULT_FACTORS = [
  { id: "A", name: "Размер денег" },
  { id: "B", name: "Срок до денег" },
  { id: "C", name: "Юнит-экономика" },
  { id: "D", name: "Защищаемость" },
  { id: "E", name: "Реализуемость" },
];

// Актуальный метапромт проекта: если правили вручную (promptEdited) и текст непустой —
// берём project.prompt; иначе генерим из ответов. Единая точка истины для показа,
// рассылки, синтеза, скачивания. buildPrompt инъектируется (ядро/заглушка).
export function resolvePrompt(project, buildPrompt) {
  const p = project || {};
  if (p.promptEdited && String(p.prompt || "").trim()) return p.prompt;
  return buildPrompt(p.answers || {});
}

// Ответы опросника → группы по блокам для раскрываемого показа в карточке.
// blocks — схема BLOCKS ядра [{title, fields:[{id,num,label}]}]. Пустые ответы пропускаем.
export function answersToRows(answers, blocks) {
  const a = answers || {};
  const out = [];
  for (const b of blocks || []) {
    const items = [];
    for (const f of b.fields || []) {
      const v = a[f.id];
      const text = v ? String(v.text || "").trim() : "";
      if (!text) continue;
      const label = (f.num ? `${f.num}. ` : "") + (f.label || f.id);
      items.push({ label, text, tag: (v && v.tag) || "" });
    }
    if (items.length) out.push({ title: b.title || "", items });
  }
  return out;
}

// Итоги оценок проекта (0–100) для v0 и v1. computeScore инъектируется (ядро —
// в браузере, заглушка — в тестах), поэтому функция чистая и тестируемая.
export function projectTotals(project, computeScore) {
  const answers = (project && project.answers) || {};
  const scores = (project && project.scores) || {};
  const total = (s) => {
    if (!s || !Object.keys(s).length) return null;
    try {
      const r = computeScore(answers, s);
      return r && typeof r.total === "number" ? r.total : null;
    } catch {
      return null;
    }
  };
  return { v0: total(scores.v0), v1: total(scores.v1) };
}

// Промт синтеза: сводит готовые deep-research отчёты в один структурированный
// + требует в конце машиночитаемую строку БАЛЛЫ (для авто-простановки v1).
export function buildSynthesisPrompt(project, factors = DEFAULT_FACTORS) {
  const name = (project && project.name) || "проект";
  const desc = (project && project.desc) || "";
  const reports = ((project && project.researches) || []).filter(
    (r) => r && r.status === "done" && String(r.text || "").trim()
  );
  const parts = reports
    .map((r, i) => `### Источник ${i + 1}: ${r.model}\n${String(r.text).trim()}`)
    .join("\n\n");

  return [
    `Ты — аналитик венчурного фонда. Ниже несколько независимых deep-research отчётов`,
    `по проекту «${name}»${desc ? ` (${desc})` : ""}. Сведи их в ОДИН структурированный`,
    `отчёт на русском: убери воду и повторы, сопоставь источники, отметь расхождения`,
    `(если данные противоречат — пометь «расхождение: …»), сохрани конкретику и цифры.`,
    ``,
    `Структура итогового отчёта (markdown):`,
    `# Сводный отчёт: ${name}`,
    `## Кратко (TL;DR) — 5–7 пунктов`,
    `## Рынок и спрос`,
    `## Конкуренты`,
    `(таблица: Игрок | Рынок | Модель | Цена | Примечание)`,
    `## Юнит-экономика и монетизация`,
    `## Риски и самое рискованное допущение`,
    `## Что проверить (гипотезы)`,
    `## Вывод и рекомендация`,
    `## Оценка по факторам`,
    `(по каждому фактору — балл 1–5 с короткой аргументацией)`,
    ``,
    `В САМОМ КОНЦЕ ответа добавь ОДНУ строку строго такого формата (для автоскоринга):`,
    `БАЛЛЫ: ${factors.map((f) => `${f.id}=N`).join(" ")}`,
    `где N — целое 1–5 по каждому фактору: ${factors
      .map((f) => `${f.id} — ${f.name}`)
      .join("; ")}.`,
    ``,
    `Пиши только markdown итогового отчёта, без преамбулы.`,
    ``,
    `=== ОТЧЁТЫ ИСТОЧНИКОВ ===`,
    parts || "(нет готовых отчётов)",
  ].join("\n");
}

// Парсит строку «БАЛЛЫ: A=4 B=3 …» из текста синтеза. Возвращает только валидные
// факторы (целое 1–5). Ищем в пределах строки БАЛЛЫ, чтобы не цеплять числа из текста.
export function parseScores(text, ids = DEFAULT_FACTORS.map((f) => f.id)) {
  const out = {};
  if (!text) return out;
  const m = String(text).match(/БАЛЛЫ\s*:?[^\n]*/i);
  const scope = m ? m[0] : "";
  if (!scope) return out;
  for (const id of ids) {
    const mm = scope.match(new RegExp("\\b" + id + "\\s*[=:]\\s*([1-5])\\b"));
    if (mm) out[id] = Number(mm[1]);
  }
  return out;
}

// Минимальный markdown → HTML: заголовки, списки, таблицы, ссылки, жирный/курсив,
// инлайн-код, код-блоки, абзацы. Покрывает то, что встречается в отчётах моделей.
export function mdToHtml(md) {
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

  const splitRow = (l) =>
    l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((s) => s.trim());
  const isTableSep = (l) =>
    /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(l || "");
  const isHeading = (l) => /^#{1,4}\s/.test(l || "");
  const isUl = (l) => /^\s*[-*]\s+/.test(l || "");
  const isOl = (l) => /^\s*\d+\.\s+/.test(l || "");

  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre>${esc(buf.join("\n"))}</pre>`);
      continue;
    }
    if (l.includes("|") && isTableSep(lines[i + 1])) {
      const header = splitRow(l);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      let t =
        "<table><thead><tr>" +
        header.map((h) => `<th>${inline(h)}</th>`).join("") +
        "</tr></thead><tbody>";
      t += rows
        .map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>")
        .join("");
      t += "</tbody></table>";
      out.push(t);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
      i++;
      continue;
    }
    if (isUl(l)) {
      const items = [];
      while (i < lines.length && isUl(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      out.push("<ul>" + items.map((x) => `<li>${inline(x)}</li>`).join("") + "</ul>");
      continue;
    }
    if (isOl(l)) {
      const items = [];
      while (i < lines.length && isOl(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ""));
      out.push("<ol>" + items.map((x) => `<li>${inline(x)}</li>`).join("") + "</ol>");
      continue;
    }
    if (l.trim() === "") {
      i++;
      continue;
    }
    const buf = [l];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isHeading(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !(lines[i].includes("|") && isTableSep(lines[i + 1]))
    ) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${buf.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}
