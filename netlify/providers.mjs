// Провайдеры для Netlify-режима: split на start() → providerId и check(id) → результат.
// Durability обеспечивают сами провайдеры (Parallel хранит run_id, OpenAI — response id),
// поэтому serverless-функции остаются короткими, а «долго думает» живёт на их стороне.

// ── Parallel.ai (Task API) ──
const PARALLEL_BASE = "https://api.parallel.ai/v1";
const PARALLEL_PROCESSOR = process.env.PARALLEL_PROCESSOR || "ultra";
// Приоритет — проектный ключ PARALLEL_API_MTS_KEY, иначе общий PARALLEL_API_KEY.
const parallelKey = () => process.env.PARALLEL_API_MTS_KEY || process.env.PARALLEL_API_KEY;

const parallel = {
  label: "Parallel.ai",
  enabled: () => Boolean(parallelKey()),
  async start(prompt) {
    const r = await fetch(`${PARALLEL_BASE}/tasks/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": parallelKey(),
      },
      body: JSON.stringify({
        input: prompt,
        processor: PARALLEL_PROCESSOR,
        task_spec: { output_schema: { type: "text" } },
      }),
    });
    if (!r.ok) throw new Error(`Parallel create ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const id = j.run_id || j.id;
    if (!id) throw new Error("Parallel: нет run_id");
    return { providerId: id, status: "running" };
  },
  async check(id) {
    const headers = { "x-api-key": process.env.PARALLEL_API_KEY };
    const st = await fetch(`${PARALLEL_BASE}/tasks/runs/${id}`, { headers });
    if (!st.ok) throw new Error(`Parallel status ${st.status}`);
    const status = (await st.json()).status;
    const terminalBad = ["failed", "cancelled", "canceled", "error"];
    if (terminalBad.includes(status)) return { status: "error", error: `Parallel: ${status}` };
    if (status !== "completed") return { status: "running" };
    const res = await fetch(`${PARALLEL_BASE}/tasks/runs/${id}/result`, { headers });
    if (!res.ok) throw new Error(`Parallel result ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()).output || {};
    const text = typeof out.content === "string" ? out.content : JSON.stringify(out.content ?? "");
    const sources = (out.basis || []).filter((b) => b && b.url).map((b) => ({ title: b.title || b.url, url: b.url }));
    return { status: "done", text: text.trim(), sources: dedupe(sources) };
  },
};

// ── OpenAI (ChatGPT, Responses API, background) ──
const OPENAI_BASE = "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.1";
// Приоритет — проектный ключ OPENAI_API_MTS_KEY, иначе общий OPENAI_API_KEY.
const openaiKey = () => process.env.OPENAI_API_MTS_KEY || process.env.OPENAI_API_KEY;

const openai = {
  label: "ChatGPT (OpenAI)",
  enabled: () => Boolean(openaiKey()),
  async start(prompt) {
    const r = await fetch(`${OPENAI_BASE}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey()}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        tools: [{ type: "web_search" }],
        background: true, // асинхронно → опрашиваем по id
      }),
    });
    if (!r.ok) throw new Error(`OpenAI create ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    if (!j.id) throw new Error("OpenAI: нет response id");
    return { providerId: j.id, status: "running" };
  },
  async check(id) {
    const r = await fetch(`${OPENAI_BASE}/responses/${id}`, {
      headers: { Authorization: `Bearer ${openaiKey()}` },
    });
    if (!r.ok) throw new Error(`OpenAI get ${r.status}`);
    const j = await r.json();
    if (j.status === "failed" || j.status === "cancelled" || j.status === "incomplete") {
      return { status: "error", error: `OpenAI: ${j.status}` };
    }
    if (j.status !== "completed") return { status: "running" };
    // Текст + источники из output[].content[].
    let text = j.output_text || "";
    const sources = [];
    if (!text && Array.isArray(j.output)) {
      for (const item of j.output) {
        for (const c of item.content || []) {
          if (c.type === "output_text" && c.text) {
            text += c.text;
            for (const a of c.annotations || []) {
              if (a.url) sources.push({ title: a.title || a.url, url: a.url });
            }
          }
        }
      }
    }
    return { status: "done", text: text.trim(), sources: dedupe(sources) };
  },
};

export const PROVIDERS = { parallel, openai };

function dedupe(sources) {
  const seen = new Set();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

// Мок-режим: нет ключа → providerId "MOCK", check сразу отдаёт заглушку.
export async function runStart(name, prompt) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Неизвестный провайдер: ${name}`);
  if (!p.enabled()) return { providerId: "MOCK", status: "running", mock: true };
  return p.start(prompt);
}

export async function runCheck(name, providerId) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Неизвестный провайдер: ${name}`);
  if (providerId === "MOCK" || !p.enabled()) {
    return {
      status: "done",
      mock: true,
      text: `[МОК ${p ? p.label : name}] Ключ не задан — заглушка. В реальном режиме здесь deep-research отчёт.`,
      sources: [],
    };
  }
  return p.check(providerId);
}

export function providerStatus() {
  return Object.fromEntries(
    Object.entries(PROVIDERS).map(([name, p]) => [name, { label: p.label, enabled: p.enabled() }])
  );
}
