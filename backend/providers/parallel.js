// Parallel.ai Task API (deep research).
// Док: POST /v1/tasks/runs → run_id; поллинг статуса; GET /v1/tasks/runs/{id}/result.
// Текст результата — output.content, источники — output.basis[].{url,title}.
const BASE = "https://api.parallel.ai/v1";
const PROCESSOR = process.env.PARALLEL_PROCESSOR || "ultra"; // pro|ultra (deep research)
const POLL_MS = 10000;
const MAX_WAIT_MS = 45 * 60 * 1000; // ultra может думать долго

function dedupe(sources) {
  const seen = new Set();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

export default {
  name: "parallel",
  label: "Parallel.ai",
  enabled() {
    return Boolean(process.env.PARALLEL_API_KEY);
  },
  async run(prompt) {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": process.env.PARALLEL_API_KEY,
    };

    // 1) Создать задачу.
    const create = await fetch(`${BASE}/tasks/runs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: prompt,
        processor: PROCESSOR,
        task_spec: { output_schema: { type: "text" } },
      }),
    });
    if (!create.ok) {
      throw new Error(`Parallel create ${create.status}: ${(await create.text()).slice(0, 300)}`);
    }
    const run = await create.json();
    const runId = run.run_id || run.id;
    if (!runId) throw new Error("Parallel: в ответе нет run_id");

    // 2) Поллинг статуса до терминального.
    const terminal = ["completed", "failed", "cancelled", "canceled", "error"];
    let status = run.status || "queued";
    const deadline = Date.now() + MAX_WAIT_MS;
    while (!terminal.includes(status)) {
      if (Date.now() > deadline) throw new Error("Parallel: таймаут ожидания результата");
      await new Promise((r) => setTimeout(r, POLL_MS));
      const st = await fetch(`${BASE}/tasks/runs/${runId}`, { headers });
      if (!st.ok) throw new Error(`Parallel status ${st.status}: ${(await st.text()).slice(0, 200)}`);
      status = (await st.json()).status;
    }
    if (status !== "completed") throw new Error(`Parallel статус: ${status}`);

    // 3) Результат.
    const res = await fetch(`${BASE}/tasks/runs/${runId}/result`, { headers });
    if (!res.ok) {
      throw new Error(`Parallel result ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = await res.json();
    const out = data.output || {};
    const text =
      typeof out.content === "string" ? out.content : JSON.stringify(out.content ?? "", null, 2);
    const sources = [];
    for (const b of out.basis || []) {
      if (b && b.url) sources.push({ title: b.title || b.url, url: b.url });
    }
    return { text: text.trim(), sources: dedupe(sources), raw: data };
  },
};
