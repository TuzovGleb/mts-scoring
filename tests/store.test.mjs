// Автотесты реестра проектов (store.js) на in-memory хранилище.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, memoryStorage, blankProject, isBlank } from "../frontend/store.js";

test("create / list / get", () => {
  const s = createStore(memoryStorage());
  const a = s.create({ name: "Проект A" });
  const b = s.create({ name: "Проект B" });
  assert.equal(s.list().length, 2);
  assert.equal(s.get(a.id).name, "Проект A");
  assert.equal(s.get("нет"), null);
  // активным становится последний созданный
  assert.equal(s.getActiveId(), b.id);
});

test("update: scores мёржатся по-факторно (v0 не стирает v1)", () => {
  const s = createStore(memoryStorage());
  const p = s.create({ name: "P", scores: { v0: { A: 3 }, v1: { B: 5 } } });
  const u = s.update(p.id, { scores: { v0: { A: 4, C: 2 } } });
  assert.equal(u.scores.v0.A, 4);
  assert.equal(u.scores.v0.C, 2);
  assert.equal(u.scores.v1.B, 5, "v1 сохранился");
  assert.ok(u.updatedAt >= p.createdAt);
});

test("rename / remove + переключение активного", () => {
  const s = createStore(memoryStorage());
  const a = s.create({ name: "A" });
  const b = s.create({ name: "B" });
  s.setActive(a.id);
  s.rename(a.id, "A2");
  assert.equal(s.get(a.id).name, "A2");
  s.remove(a.id);
  assert.equal(s.get(a.id), null);
  assert.equal(s.list().length, 1);
  assert.equal(s.getActiveId(), b.id, "активный переехал на оставшийся");
});

test("getOrCreateActive создаёт проект на пустом сторе", () => {
  const s = createStore(memoryStorage());
  const p = s.getOrCreateActive();
  assert.ok(p && p.id);
  assert.equal(s.list().length, 1);
  assert.equal(s.getOrCreateActive().id, p.id, "повторно — тот же активный");
});

test("migrateLegacy: переносит старый черновик один раз", () => {
  const seed = {
    "scoring-app:v1": JSON.stringify({
      answers: { q1: { text: "СтарыйПроект", tag: "" }, q2: { text: "делает X", tag: "Ф" } },
      scores: { A: 3 },
    }),
  };
  const s = createStore(memoryStorage(seed));
  const migrated = s.migrateLegacy();
  assert.ok(migrated, "проект создан");
  assert.equal(migrated.name, "СтарыйПроект");
  assert.equal(migrated.answers.q2.text, "делает X");
  assert.equal(migrated.scores.v0.A, 3);
  // идемпотентность: второй вызов ничего не делает
  assert.equal(s.migrateLegacy(), null);
  assert.equal(s.list().length, 1);
});

test("migrateLegacy: пустой/отсутствующий черновик → null, но флаг ставится", () => {
  const s = createStore(memoryStorage());
  assert.equal(s.migrateLegacy(), null);
  assert.equal(s.migrateLegacy(), null);
  assert.equal(s.list().length, 0);
});

test("isBlank: пустой vs заполненный", () => {
  assert.equal(isBlank(blankProject()), true);
  assert.equal(isBlank(blankProject({ answers: { q1: { text: "  " } } })), true, "пробелы не считаются");
  assert.equal(isBlank(blankProject({ answers: { q1: { text: "Идея" } } })), false);
  assert.equal(isBlank(blankProject({ prompt: "метапромт" })), false);
});

test("startNew: пустой активный переиспользуется, заполненный → новый", () => {
  const s = createStore(memoryStorage());
  // на пустом сторе startNew создаёт первый проект
  const a = s.startNew();
  assert.equal(s.list().length, 1);
  // активный пустой → повторный startNew возвращает его же, без дублей
  assert.equal(s.startNew().id, a.id);
  assert.equal(s.list().length, 1, "дубликат не создан");
  // наполнили активный → startNew создаёт новый и делает активным
  s.update(a.id, { answers: { q1: { text: "Проект A" } } });
  const b = s.startNew();
  assert.notEqual(b.id, a.id);
  assert.equal(s.list().length, 2);
  assert.equal(s.getActiveId(), b.id);
});

test("blankProject: дефолты корректны", () => {
  const p = blankProject();
  assert.deepEqual(p.scores, { v0: {}, v1: {} });
  assert.deepEqual(p.researches, []);
  assert.equal(p.synthesis, null);
  assert.equal(p.decision, null);
});
