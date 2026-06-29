// Автотесты чистых помощников отчётов (report.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSynthesisPrompt,
  mdToHtml,
  parseScores,
  projectTotals,
  resolvePrompt,
  answersToRows,
} from "../frontend/report.js";

test("buildSynthesisPrompt: включает имя, структуру и тексты готовых отчётов", () => {
  const p = {
    name: "StayFit",
    desc: "трекер питания",
    researches: [
      { model: "parallel", status: "done", text: "Рынок растёт на 20%." },
      { model: "openai", status: "done", text: "Конкуренты: FatSecret, Lifesum." },
      { model: "openai", status: "running", text: "" }, // не готов — игнор
    ],
  };
  const s = buildSynthesisPrompt(p);
  assert.ok(s.includes("StayFit"));
  assert.ok(s.includes("# Сводный отчёт: StayFit"));
  assert.ok(s.includes("Рынок растёт на 20%."), "текст готового отчёта внутри");
  assert.ok(s.includes("FatSecret"));
  assert.ok(!/status.*running/.test(s), "незавершённый не добавлен дословно");
  assert.ok(s.includes("## Конкуренты"));
});

test("buildSynthesisPrompt: нет готовых отчётов → заглушка", () => {
  const s = buildSynthesisPrompt({ name: "X", researches: [] });
  assert.ok(s.includes("(нет готовых отчётов)"));
});

test("buildSynthesisPrompt: требует блок БАЛЛЫ с факторами", () => {
  const s = buildSynthesisPrompt({ name: "X", researches: [] });
  assert.ok(s.includes("БАЛЛЫ: A=N B=N C=N D=N E=N"), "формат строки баллов");
  assert.ok(s.includes("A — Размер денег"));
  assert.ok(s.includes("## Оценка по факторам"));
});

test("parseScores: стандартный формат → объект 1–5", () => {
  const r = parseScores("…отчёт…\n\nБАЛЛЫ: A=4 B=3 C=2 D=3 E=5");
  assert.deepEqual(r, { A: 4, B: 3, C: 2, D: 3, E: 5 });
});

test("parseScores: вариативность (запятые, двоеточия, частично)", () => {
  const r = parseScores("Баллы: A=5, B:1, C = 3");
  assert.equal(r.A, 5);
  assert.equal(r.B, 1);
  assert.equal(r.C, 3);
  assert.equal(r.D, undefined);
});

test("parseScores: вне диапазона и без блока игнорируются", () => {
  assert.deepEqual(parseScores("БАЛЛЫ: A=7 B=0 C=3"), { C: 3 }, "7 и 0 отброшены");
  assert.deepEqual(parseScores("отчёт без блока баллов, число 5 где-то"), {});
});

test("resolvePrompt: правлено → project.prompt, иначе из ответов", () => {
  const build = (a) => `СГЕНЕРИРОВАНО:${(a.q1 && a.q1.text) || ""}`;
  // не правили → генерируем из ответов (даже если prompt был снапшот)
  assert.equal(
    resolvePrompt({ answers: { q1: { text: "X" } }, prompt: "старый", promptEdited: false }, build),
    "СГЕНЕРИРОВАНО:X"
  );
  // правили и текст есть → берём правленый
  assert.equal(
    resolvePrompt({ answers: { q1: { text: "X" } }, prompt: "МОЙ ТЕКСТ", promptEdited: true }, build),
    "МОЙ ТЕКСТ"
  );
  // правили, но пусто → фолбэк на генерацию
  assert.equal(
    resolvePrompt({ answers: { q1: { text: "X" } }, prompt: "   ", promptEdited: true }, build),
    "СГЕНЕРИРОВАНО:X"
  );
});

test("answersToRows: группирует по блокам, пропускает пустые", () => {
  const blocks = [
    { title: "0. Паспорт", fields: [{ id: "q1", num: 1, label: "Название" }, { id: "q2", num: 2, label: "Что делает" }] },
    { title: "A. Деньги", fields: [{ id: "q5", label: "Рынок" }] }, // без num
    { title: "Пустой", fields: [{ id: "qX", label: "Нет ответа" }] },
  ];
  const answers = { q1: { text: "StayFit" }, q2: { text: "  " }, q5: { text: "большой", tag: "О" } };
  const rows = answersToRows(answers, blocks);
  assert.equal(rows.length, 2, "пустой блок не попал");
  assert.equal(rows[0].title, "0. Паспорт");
  assert.deepEqual(rows[0].items, [{ label: "1. Название", text: "StayFit", tag: "" }]);
  assert.deepEqual(rows[1].items, [{ label: "Рынок", text: "большой", tag: "О" }]);
});

test("projectTotals: v0/v1 считаются, пустые → null", () => {
  // заглушка ядра: total = сумма баллов * 10 (детерминированно)
  const fake = (_a, s) => ({ total: Object.values(s).reduce((x, y) => x + Number(y), 0) * 10 });
  const p = { answers: {}, scores: { v0: { A: 3, B: 2 }, v1: { A: 4 } } };
  assert.deepEqual(projectTotals(p, fake), { v0: 50, v1: 40 });
  assert.deepEqual(projectTotals({ scores: {} }, fake), { v0: null, v1: null });
  assert.deepEqual(projectTotals({}, fake), { v0: null, v1: null });
});

test("projectTotals: ошибка в computeScore → null, не падает", () => {
  const boom = () => {
    throw new Error("нет ядра");
  };
  assert.deepEqual(projectTotals({ scores: { v0: { A: 3 } } }, boom), { v0: null, v1: null });
});

test("mdToHtml: заголовки, жирный, ссылка", () => {
  const h = mdToHtml("# Заголовок\n\nТекст **жирный** и [ссылка](https://e.com).");
  assert.ok(h.includes("<h1>Заголовок</h1>"));
  assert.ok(h.includes("<strong>жирный</strong>"));
  assert.ok(h.includes('<a href="https://e.com">ссылка</a>'));
  assert.ok(h.includes("<p>"));
});

test("mdToHtml: маркированный список", () => {
  const h = mdToHtml("- один\n- два\n- три");
  assert.ok(h.includes("<ul>"));
  assert.equal((h.match(/<li>/g) || []).length, 3);
});

test("mdToHtml: таблица markdown → <table>", () => {
  const md = "| Игрок | Цена |\n|---|---|\n| FatSecret | freemium |\n| Lifesum | $14.99 |";
  const h = mdToHtml(md);
  assert.ok(h.includes("<table>"));
  assert.ok(h.includes("<th>Игрок</th>"));
  assert.ok(h.includes("<td>FatSecret</td>"));
  assert.equal((h.match(/<tr>/g) || []).length, 3, "1 шапка + 2 строки");
});

test("mdToHtml: экранирует html", () => {
  const h = mdToHtml("текст <script>alert(1)</script>");
  assert.ok(!h.includes("<script>"));
  assert.ok(h.includes("&lt;script&gt;"));
});
