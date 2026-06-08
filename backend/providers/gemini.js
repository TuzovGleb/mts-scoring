// Google Gemini с grounding через google_search.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-pro";

export default {
  name: "gemini",
  label: "Gemini (Google)",
  enabled() {
    return Boolean(process.env.GEMINI_API_KEY);
  },
  async run(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = await res.json();
    const cand = data.candidates?.[0];

    let text = "";
    for (const part of cand?.content?.parts || []) {
      if (part.text) text += part.text;
    }

    // Источники: groundingMetadata.groundingChunks[].web.{uri,title}.
    const sources = [];
    for (const chunk of cand?.groundingMetadata?.groundingChunks || []) {
      const w = chunk.web;
      if (w?.uri) sources.push({ title: w.title || w.uri, url: w.uri });
    }

    return { text: text.trim(), sources, raw: data };
  },
};
