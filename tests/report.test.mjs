// Автотесты чистых помощников отчётов (report.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSynthesisPrompt, mdToHtml, parseScores } from "../frontend/report.js";

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
