// Anthropic Claude с серверным инструментом web_search.
// Док: Messages API, tool web_search_20260209, модель claude-opus-4-8.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export default {
  name: "anthropic",
  label: "Claude (Anthropic)",
  enabled() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },
  async run(prompt) {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Серверный web_search долгий → стримим и собираем финальное сообщение.
    // Цикл по pause_turn: серверный инструмент может приостановиться на лимите итераций.
    let messages = [{ role: "user", content: prompt }];
    let finalText = "";
    const sources = [];
    let raw = null;

    for (let i = 0; i < 6; i++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages,
      });
      const msg = await stream.finalMessage();
      raw = msg;

      for (const block of msg.content) {
        if (block.type === "text") finalText += block.text;
        // Источники приходят в web_search_tool_result и/или в citations у текстовых блоков.
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) {
            if (r.url) sources.push({ title: r.title || r.url, url: r.url });
          }
        }
        if (block.type === "text" && Array.isArray(block.citations)) {
          for (const c of block.citations) {
            if (c.url) sources.push({ title: c.title || c.url, url: c.url });
          }
        }
      }

      if (msg.stop_reason === "pause_turn") {
        messages = [
          { role: "user", content: prompt },
          { role: "assistant", content: msg.content },
        ];
        continue;
      }
      break;
    }

    return { text: finalText.trim(), sources: dedupe(sources), raw };
  },
};

function dedupe(sources) {
  const seen = new Set();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}
