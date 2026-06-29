// POST /api/start { prompt, models[] } → { jobs: [{model, providerId, status, mock?}] }
// Короткий вызов: только создаёт задачи у провайдеров и возвращает их id.
import { runStart, providerStatus } from "../providers.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const ALL = ["parallel", "openai"];

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return json({ ok: true, providers: providerStatus() });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "невалидный JSON" }, 400);
  }
  const { prompt, models } = body || {};
  if (!prompt || typeof prompt !== "string") return json({ error: "prompt обязателен" }, 400);
  const chosen = (Array.isArray(models) && models.length ? models : ALL).filter((m) =>
    ALL.includes(m)
  );
  if (!chosen.length) return json({ error: "нет валидных моделей" }, 400);

  const jobs = await Promise.all(
    chosen.map(async (m) => {
      try {
        const s = await runStart(m, prompt);
        return { model: m, providerId: s.providerId, status: s.status || "running", mock: !!s.mock };
      } catch (e) {
        return { model: m, status: "error", error: String(e?.message || e) };
      }
    })
  );
  return json({ jobs });
};

export const config = { path: "/api/start" };
