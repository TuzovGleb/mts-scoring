import perplexity from "./perplexity.js";
import openai from "./openai.js";
import gemini from "./gemini.js";
import anthropic from "./anthropic.js";

export const PROVIDERS = { perplexity, openai, gemini, anthropic };

// Мок-режим: если у провайдера нет ключа, возвращаем заглушку,
// чтобы рассылку можно было протестировать end-to-end без реальных API.
export async function runProvider(name, prompt) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Неизвестный провайдер: ${name}`);
  if (!p.enabled()) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      text:
        `[МОК ${p.label}] Ключ не задан в .env — это заглушка.\n\n` +
        `Промт принят (${prompt.length} симв.). В реальном режиме здесь будет ` +
        `deep-research отчёт по факторам: размер денег, срок до денег, юнит-экономика, ` +
        `защищаемость/конкуренция + bear-case.`,
      sources: [],
      raw: { mock: true },
      mock: true,
    };
  }
  return p.run(prompt);
}

export function providerStatus() {
  return Object.fromEntries(
    Object.entries(PROVIDERS).map(([name, p]) => [
      name,
      { label: p.label, enabled: p.enabled() },
    ])
  );
}
