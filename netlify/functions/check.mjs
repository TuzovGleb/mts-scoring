// POST /api/check { jobs: [{model, providerId, status}] } → { jobs: [...обновлённые] }
// Короткий вызов: спрашивает у провайдеров статус по id; готово → текст + источники.
import { runCheck } from "../providers.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "невалидный JSON" }, 400);
  }
  const { jobs } = body || {};
  if (!Array.isArray(jobs)) return json({ error: "jobs[] обязателен" }, 400);

  const out = await Promise.all(
    jobs.map(async (j) => {
      if (!j || !j.model) return { ...j, status: "error", error: "нет model" };
      if (!j.providerId) return j; // не стартовал
      if (j.status === "done" || j.status === "error") return j; // уже терминальный
      try {
        const r = await runCheck(j.model, j.providerId);
        return { ...j, ...r };
      } catch (e) {
        return { ...j, status: "error", error: String(e?.message || e) };
      }
    })
  );
  return json({ jobs: out });
};

export const config = { path: "/api/check" };
