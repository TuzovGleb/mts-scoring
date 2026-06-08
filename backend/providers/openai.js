// OpenAI (ChatGPT) — Responses API с серверным инструментом web_search.
const ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.1";

export default {
  name: "openai",
  label: "ChatGPT (OpenAI)",
  enabled() {
    return Boolean(process.env.OPENAI_API_KEY);
  },
  async run(prompt) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        tools: [{ type: "web_search" }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = await res.json();

    // Удобное поле output_text, если есть; иначе собираем из output[].content[].
    let text = data.output_text || "";
    const sources = [];
    if (!text && Array.isArray(data.output)) {
      for (const item of data.output) {
        for (const c of item.content || []) {
          if (c.type === "output_text" && c.text) {
            text += c.text;
            for (const ann of c.annotations || []) {
              if (ann.url) sources.push({ title: ann.title || ann.url, url: ann.url });
            }
          }
        }
      }
    }

    return { text: text.trim(), sources, raw: data };
  },
};
