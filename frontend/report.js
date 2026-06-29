// Чистые помощники для отчётов (без DOM и без зашифрованного ядра) — поэтому
// модуль тестируется в node. Используется карточкой проекта (projects.js):
//  - buildSynthesisPrompt: промт для сведения отчётов моделей в один (gpt-5.1);
//  - mdToHtml: минимальный markdown → HTML для красивого показа и печати в PDF.

// Промт синтеза: сводит готовые deep-research отчёты в один структурированный.
export function buildSynthesisPrompt(project) {
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
    ``,
    `Пиши только markdown итогового отчёта, без преамбулы.`,
    ``,
    `=== ОТЧЁТЫ ИСТОЧНИКОВ ===`,
    parts || "(нет готовых отчётов)",
  ].join("\n");
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
