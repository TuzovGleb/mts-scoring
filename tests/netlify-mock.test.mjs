// Автотесты Netlify-функций рассылки в мок-режиме (без ключей).
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import start from "../netlify/functions/start.mjs";
import check from "../netlify/functions/check.mjs";

const post = (fn, body) =>
  fn(
    new Request("http://x/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

test("start: создаёт мок-задачи для parallel и openai", async () => {
  const res = await post(start, { prompt: "тест", models: ["parallel", "openai"] });
  assert.equal(res.headers.get("access-control-allow-origin"), "*", "CORS");
  const j = await res.json();
  assert.equal(j.jobs.length, 2);
  assert.ok(j.jobs.every((x) => x.providerId === "MOCK" && x.mock === true));
});

test("check: мок-задачи отдают готовый результат", async () => {
  const started = await (await post(start, { prompt: "т", models: ["parallel", "openai"] })).json();
  const res = await post(check, { jobs: started.jobs });
  const j = await res.json();
  assert.ok(j.jobs.every((x) => x.status === "done" && x.mock === true));
  assert.match(j.jobs[0].text, /МОК/);
});

test("start: health через GET", async () => {
  const res = await start(new Request("http://x/api/start", { method: "GET" }));
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.ok(j.providers.parallel && j.providers.openai);
});

test("start: пустой prompt → 400", async () => {
  const res = await post(start, { models: ["parallel"] });
  assert.equal(res.status, 400);
});
