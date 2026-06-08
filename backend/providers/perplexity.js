// Perplexity ("параллельс") — Sonar deep research через OpenAI-совместимый chat/completions.
const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const MODEL = process.env.PERPLEXITY_MODEL || "sonar-deep-research";

export default {
  name: "perplexity",
  label: "Perplexity (Sonar)",
  enabled() {
    return Boolean(process.env.PERPLEXITY_API_KEY);
  },
  async run(prompt) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Perplexity ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";

    // Источники: citations (массив URL) или search_results (массив объектов).
    const sources = [];
    for (const u of data.citations || []) {
      if (typeof u === "string") sources.push({ title: u, url: u });
    }
    for (const r of data.search_results || []) {
      if (r.url) sources.push({ title: r.title || r.url, url: r.url });
    }

    return { text, sources, raw: data };
  },
};
