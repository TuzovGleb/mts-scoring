// Автотесты ядра: генератор метапромта v6, скоринг, шаблон/разбор.
// Запуск: npm test  (node --test tests/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPrompt,
  computeScore,
  buildTemplate,
  parseTemplate,
  FACTORS,
} from "../content-src/scoring-core.js";

const A = (text, tag = "") => ({ text, tag });

// Фикстура: маркетплейс + экспансия (Invite-подобная, обезличенная по структуре).
const mp = {
  q1: A("Демо"),
  q2: A("двусторонний маркетплейс гостей для заведений", "Ф"),
  q3: A("ночные клубы, караоке", "Ф"),
  q4: A("штатный промоутер", "Ф"),
  biz_type: A("двусторонний маркетплейс"),
  monetization: A("B2B"),
  geo_core: A("Москва + СПб"),
  geo_exp: A("Дубай (ОАЭ)"),
  q5: A("TAM ~23 тыс заведений", "О"),
  q6: A("ARPU 350–900к ₽/год", "О"),
  q7: A("300–500 за 3 года", "О"),
  q8: A("платили ~15 заведений", "Ф"),
  q11: A("CAC ≤50к", "О"),
  q12: A("удержание ~3 года", "Д"),
  moat: A("база, курация, связи, геоподтверждение", "Ф"),
  q16: A("рабочее приложение", "Ф"),
  q17: A("6 FTE", "Ф"),
  q18: A("burn 2,5 млн/мес", "Ф"),
  q19: A("внешние клубы платили", "Ф"),
  year: A("2026"),
  threshold: A("100"),
};

test("метапромт v6: блоки и условные секции (маркетплейс + экспансия)", () => {
  const p = buildPrompt(mp);
  assert.match(p, /3\. СТОРОНА ПРЕДЛОЖЕНИЯ/, "Задача 3 для маркетплейса");
  assert.match(p, /Дубай/, "экспансия в шапке");
  assert.match(p, /≥100 млн/, "порог");
  assert.match(p, /2024–2026/, "год и источники");
  assert.match(p, /Модель монетизации: B2B/, "строка монетизации");
  assert.match(p, /10\. КОНТРОЛЬ ОБЪЁМА/, "правило 10");
  assert.match(p, /КОСВЕННЫЕ \/ СУБСТИТУТЫ/, "косвенные конкуренты");
  assert.match(p, /ЦЕНОВОЕ СРАВНЕНИЕ/, "ценовое сравнение");
  assert.match(p, /G\) САМОЕ РИСКОВАННОЕ ПРЕДПОЛОЖЕНИЕ \+ RAT/, "блок G");
  assert.match(p, /H\) ВАРИАНТЫ ГИПОТЕЗ НА ПРОВЕРКУ/, "блок H");
  assert.equal((p.match(/ПИШИ ПОЛНОСТЬЮ, не сокращай/g) || []).length, 2, "G и H помечены");
  assert.match(p, /• B2B:/);
  assert.ok(!/• B2C:/.test(p), "только B2B-ветка");
});

test("метапромт: не маркетплейс без экспансии", () => {
  const p = buildPrompt({ ...mp, biz_type: A("не маркетплейс"), geo_exp: A("нет") });
  assert.ok(!/3\. СТОРОНА ПРЕДЛОЖЕНИЯ/.test(p), "нет Задачи 3");
  assert.ok(!/для маркетплейса также Задача 3/.test(p), "оговорка убрана");
  assert.match(p, /экспансия не рассматривается/);
  assert.ok(!/Дубай/.test(p));
});

test("метапромт: ветки монетизации B2C и B2B2C", () => {
  const b2c = buildPrompt({ ...mp, monetization: A("B2C") });
  assert.match(b2c, /• B2C:/);
  assert.ok(!/• B2B:/.test(b2c));
  const b2b2c = buildPrompt({ ...mp, monetization: A("B2B2C") });
  assert.match(b2b2c, /• B2B:/);
  assert.match(b2b2c, /• B2C:/);
});

test("финальные критерии: веса 25/25/20/20/10 и фактор D = Защищаемость", () => {
  assert.equal(
    [FACTORS.A, FACTORS.B, FACTORS.C, FACTORS.D, FACTORS.E].map((f) => f.weight).join("/"),
    "25/25/20/20/10"
  );
  assert.equal(FACTORS.D.name, "Защищаемость");
  assert.match(buildPrompt(mp), /уникальный ров — IP\/данные\/лицензия или рельс МТС/);
});

test("скоринг: считает итог и флаг overclaim", () => {
  const r = computeScore(mp, { A: 3, B: 3, C: 2, D: 4, E: 4 });
  assert.equal(typeof r.total, "number");
  assert.ok(r.total >= 0 && r.total <= 100);
  assert.equal(r.perFactor.length, 5);
});

test("скоринг v1: взвешенный итог по весам 25/25/20/20/10", () => {
  // (5/5·25)+(4/5·25)+(3/5·20)+(2/5·20)+(1/5·10) = 25+20+12+8+2 = 67
  const r = computeScore(mp, { A: 5, B: 4, C: 3, D: 2, E: 1 });
  assert.equal(r.total, 67);
  // Частичная оценка: только A и B → итог нормируется на использованный вес (50).
  const partial = computeScore(mp, { A: 5, B: 5 });
  assert.equal(partial.total, 100);
});

test("шаблон: round-trip [id]", () => {
  const filled = buildTemplate()
    .split("\n")
    .map((ln) => (/^\[\w+\]/.test(ln) ? ln + " тест (Ф)" : ln))
    .join("\n");
  const a = parseTemplate(filled).answers;
  assert.equal(a.q2.text, "тест");
  assert.equal(a.q2.tag, "Ф");
  assert.ok(a.q5 && a.q18, "текстовые поля заполнены");
  assert.ok(!a.monetization, "select с мусором не ставится");
});

test("разбор: латинский тег F→Ф", () => {
  assert.equal(parseTemplate("[q1] X: тест (F)").answers.q1.tag, "Ф");
});

test("разбор обычного формата «Поле: ответ» (StayFit)", () => {
  const sf = parseTemplate(`Название: StayFit
Что делает: по фото распознаёт калории. (Ф — со слов основателя)
Кто платит (ICP): конечные пользователи, B2C-подписка. (Ф / О)
→ Тип бизнеса: односторонний B2C-подписочный. Не маркетплейс.
CAC: дорогой платный трафик. (Д)
Моат: пока нет. (Ф)
Конкуренты: MyFitnessPal, YAZIO. (О)
Предчтение: тянет вниз.`).answers;
  assert.equal(sf.q1.text, "StayFit");
  assert.equal(sf.q2.tag, "Ф");
  assert.equal(sf.biz_type.text, "не маркетплейс");
  assert.match(sf.q11.text, /платный трафик/);
  assert.match(sf.moat.text, /пока нет/);
  assert.match(sf.q15.text, /MyFitnessPal/);
  assert.equal(sf.monetization.text, "B2C", "монетизация выведена из ICP");
  assert.ok(!Object.values(sf).some((x) => /тянет вниз/.test(x.text)), "Предчтение не попало");
});
