import { BLOCKS, TAGS, DEFAULTS, ALL_FIELDS, FACTORS } from "./questionnaire.js";
import { buildPrompt, promptTitle } from "./prompt-template.js";
import { computeScore } from "./scoring.js";

const LS_KEY = "scoring-app:v1";
const BACKEND_LS = "scoring-app:backend";
const STEPS = [...BLOCKS, { id: "result", title: "Результат" }];

// Провайдеры для рассылки (Фаза 2). name должен совпадать с бэкендом.
const DISPATCH_MODELS = [
  { name: "perplexity", label: "Perplexity" },
  { name: "openai", label: "ChatGPT" },
  { name: "gemini", label: "Gemini" },
  { name: "anthropic", label: "Claude" },
];

// Состояние рассылки (не персистится — живёт в рамках сессии экрана результата).
const dispatch = {
  jobId: null,
  status: null,
  results: {},
  selected: DISPATCH_MODELS.map((m) => m.name),
  timer: null,
};

function backendUrl() {
  return localStorage.getItem(BACKEND_LS) || "http://localhost:8787";
}

// ── Состояние ──
const state = {
  answers: {}, // { fieldId: { text, tag } }
  scores: {}, // { A..E: 1..5 }
  step: 0,
};

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state.answers = saved.answers || {};
      state.scores = saved.scores || {};
      state.step = saved.step || 0;
    }
  } catch (e) {
    console.warn("Не удалось прочитать сохранение:", e);
  }
  // Значения по умолчанию для незаполненных полей.
  for (const [id, v] of Object.entries(DEFAULTS)) {
    if (!state.answers[id] || !String(state.answers[id].text || "").trim()) {
      state.answers[id] = { text: String(v), tag: "" };
    }
  }
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Не удалось сохранить:", e);
  }
}

function setAnswer(id, patch) {
  state.answers[id] = { text: "", tag: "", ...state.answers[id], ...patch };
  saveState();
}

// ── Утилиты DOM ──
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2), v);
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = el("div", { class: "toast" });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), 1800);
}

// ── Рендер поля ──
function renderField(f) {
  const wrap = el("div", { class: "field" });

  const labelText = f.num ? `${f.num}. ${f.label}` : f.label;
  const label = el("label", { class: "field__label", for: f.id });
  if (f.num) label.appendChild(el("span", { class: "field__num" }, `${f.num}.`));
  label.appendChild(document.createTextNode(f.num ? ` ${f.label}` : labelText));
  wrap.appendChild(label);

  if (f.hint) wrap.appendChild(el("div", { class: "field__hint" }, f.hint));

  const cur = state.answers[f.id] || { text: "", tag: "" };
  let input;

  if (f.type === "select") {
    input = el("select", { id: f.id });
    for (const opt of f.options) {
      const o = el("option", { value: opt.value }, opt.label);
      if (cur.text === opt.value) o.selected = true;
      input.appendChild(o);
    }
    input.addEventListener("change", (e) => setAnswer(f.id, { text: e.target.value }));
  } else if (f.type === "textarea") {
    input = el("textarea", { id: f.id }, cur.text || "");
    input.addEventListener("input", (e) => setAnswer(f.id, { text: e.target.value }));
  } else {
    input = el("input", {
      id: f.id,
      type: f.type === "number" ? "number" : "text",
      value: cur.text || "",
    });
    input.addEventListener("input", (e) => setAnswer(f.id, { text: e.target.value }));
  }
  wrap.appendChild(input);

  if (f.tag) {
    const tags = el("div", { class: "tags" });
    for (const t of TAGS) {
      const chip = el(
        "button",
        {
          type: "button",
          class: "tag" + (cur.tag === t.value ? " is-active" : ""),
          title: t.title,
        },
        t.label
      );
      chip.addEventListener("click", () => {
        const newTag = cur.tag === t.value ? "" : t.value;
        setAnswer(f.id, { tag: newTag });
        render();
      });
      tags.appendChild(chip);
    }
    wrap.appendChild(tags);
  }

  return wrap;
}

// ── Рендер шага-блока ──
function renderBlockStep(block) {
  const card = el("div", { class: "card" });
  const head = el("div", { class: "step-head" });
  const titleRow = el("h2", {}, block.title);
  head.appendChild(titleRow);
  const metaParts = [];
  if (block.factor) metaParts.push(`Фактор · ${block.weightLabel}`);
  if (metaParts.length)
    head.appendChild(el("div", { class: "step-meta" }, metaParts.join(" · ")));
  card.appendChild(head);

  if (block.intro) card.appendChild(el("div", { class: "step-intro" }, block.intro));
  if (block.scale) card.appendChild(el("div", { class: "scale-note" }, block.scale));

  for (const f of block.fields) card.appendChild(renderField(f));

  return card;
}

// ── Рендер результата ──
function renderResultStep() {
  const frag = document.createDocumentFragment();

  // 1) Метапромт
  const promptCard = el("div", { class: "card" });
  promptCard.appendChild(el("div", { class: "step-head" }, el("h2", {}, "Готовый deep-research метапромт")));
  promptCard.appendChild(
    el(
      "div",
      { class: "step-intro" },
      "Собран из ответов опросника по шаблону v4. Скопируй целиком и вставь в research-модель. В Фазе 2 рассылка пойдёт автоматически по API."
    )
  );

  const prompt = buildPrompt(state.answers);
  const pre = el("pre", { class: "result-prompt" }, prompt);
  promptCard.appendChild(pre);

  const actions = el("div", { class: "result-actions" });
  const copyBtn = el("button", { class: "btn btn--sm", type: "button" }, "Копировать");
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast("Промт скопирован");
    } catch {
      // фолбэк
      const ta = el("textarea", {});
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("Промт скопирован");
    }
  });
  const dlBtn = el("button", { class: "btn btn--sm btn--ghost", type: "button" }, "Скачать .md");
  dlBtn.addEventListener("click", () => downloadMd(prompt));
  actions.appendChild(copyBtn);
  actions.appendChild(dlBtn);
  promptCard.appendChild(actions);

  // Ссылки на ручную рассылку (промт скопируй → вставь там).
  const links = el("div", { class: "send-links" });
  links.appendChild(el("span", { class: "field__hint" }, "Открыть (промт скопируй кнопкой выше):"));
  for (const [name, url] of [
    ["Perplexity", "https://www.perplexity.ai/"],
    ["ChatGPT", "https://chatgpt.com/"],
    ["Gemini", "https://gemini.google.com/app"],
    ["Claude", "https://claude.ai/new"],
  ]) {
    links.appendChild(el("a", { href: url, target: "_blank", rel: "noopener" }, name));
  }
  promptCard.appendChild(links);
  frag.appendChild(promptCard);

  // 2) Скоринг v0 (опционально)
  frag.appendChild(renderScoringCard());

  // 3) Рассылка по моделям (Фаза 2)
  frag.appendChild(renderDispatchCard(prompt));

  return frag;
}

function renderDispatchCard(prompt) {
  const card = el("div", { class: "card" });
  card.appendChild(el("div", { class: "step-head" }, el("h2", {}, "Рассылка по моделям (Фаза 2)")));
  card.appendChild(
    el(
      "div",
      { class: "step-intro" },
      "Отправляет метапромт на бэкенд, который рассылает его параллельно по выбранным моделям и собирает ответы. Нужен запущенный backend (см. README). Без ключей провайдеры отвечают заглушкой."
    )
  );

  // URL бэкенда
  const urlField = el("div", { class: "field" });
  urlField.appendChild(el("label", { class: "field__label" }, "URL бэкенда"));
  const urlInput = el("input", { type: "text", value: backendUrl() });
  urlInput.addEventListener("input", (e) =>
    localStorage.setItem(BACKEND_LS, e.target.value.trim())
  );
  urlField.appendChild(urlInput);
  card.appendChild(urlField);

  // Выбор моделей
  const picker = el("div", { class: "dispatch-models" });
  for (const m of DISPATCH_MODELS) {
    const id = `disp-${m.name}`;
    const wrap = el("label", { class: "checkbox", for: id });
    const cb = el("input", { type: "checkbox", id });
    cb.checked = dispatch.selected.includes(m.name);
    cb.addEventListener("change", (e) => {
      if (e.target.checked) {
        if (!dispatch.selected.includes(m.name)) dispatch.selected.push(m.name);
      } else {
        dispatch.selected = dispatch.selected.filter((x) => x !== m.name);
      }
    });
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(" " + m.label));
    picker.appendChild(wrap);
  }
  card.appendChild(picker);

  // Кнопка
  const actions = el("div", { class: "result-actions" });
  const sendBtn = el(
    "button",
    { class: "btn btn--sm", type: "button" },
    dispatch.status === "running" ? "Рассылка идёт…" : "Разослать"
  );
  sendBtn.disabled = dispatch.status === "running";
  sendBtn.addEventListener("click", () => startDispatch(prompt));
  actions.appendChild(sendBtn);
  card.appendChild(actions);

  // Колонки результатов
  if (Object.keys(dispatch.results).length) {
    const cols = el("div", { class: "dispatch-cols" });
    for (const m of DISPATCH_MODELS) {
      const r = dispatch.results[m.name];
      if (!r) continue;
      const col = el("div", { class: "dispatch-col" });
      const head = el("div", { class: "dispatch-col__head" });
      head.appendChild(el("span", {}, m.label));
      head.appendChild(el("span", { class: `pill pill--${r.status}` }, statusLabel(r)));
      col.appendChild(head);

      if (r.status === "error") {
        col.appendChild(el("div", { class: "dispatch-col__err" }, r.error || "ошибка"));
      } else {
        col.appendChild(el("div", { class: "dispatch-col__body" }, r.text || "…"));
        if (r.sources && r.sources.length) {
          const src = el("div", { class: "dispatch-col__src" });
          src.appendChild(el("div", { class: "field__hint" }, `Источники (${r.sources.length}):`));
          for (const s of r.sources.slice(0, 12)) {
            src.appendChild(
              el("a", { href: s.url, target: "_blank", rel: "noopener" }, s.title || s.url)
            );
          }
          col.appendChild(src);
        }
      }
      cols.appendChild(col);
    }
    card.appendChild(cols);
  }

  return card;
}

function statusLabel(r) {
  if (r.status === "running") return "идёт";
  if (r.status === "error") return "ошибка";
  if (r.status === "done") return r.mock ? "мок" : "готово";
  return r.status;
}

async function startDispatch(prompt) {
  if (!dispatch.selected.length) {
    toast("Выбери хотя бы одну модель");
    return;
  }
  dispatch.status = "running";
  dispatch.results = Object.fromEntries(
    dispatch.selected.map((n) => [n, { status: "running" }])
  );
  render();
  try {
    const res = await fetch(backendUrl() + "/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        models: dispatch.selected,
        project: (state.answers.q1?.text || "проект").trim(),
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    dispatch.jobId = data.jobId;
    pollDispatch();
  } catch (e) {
    dispatch.status = "error";
    toast("Бэкенд недоступен: " + e.message);
    render();
  }
}

function pollDispatch() {
  clearTimeout(dispatch.timer);
  const tick = async () => {
    try {
      const res = await fetch(backendUrl() + "/api/research/" + dispatch.jobId);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      dispatch.results = data.results || {};
      dispatch.status = data.status;
      render();
      if (data.status !== "done") dispatch.timer = setTimeout(tick, 2500);
      else toast("Рассылка завершена");
    } catch (e) {
      dispatch.status = "error";
      toast("Ошибка опроса: " + e.message);
      render();
    }
  };
  dispatch.timer = setTimeout(tick, 1500);
}

function renderScoringCard() {
  const card = el("div", { class: "card" });
  card.appendChild(el("div", { class: "step-head" }, el("h2", {}, "Скоринг v0 (опционально)")));
  card.appendChild(
    el(
      "div",
      { class: "step-intro" },
      "Проставь балл 1–5 по каждому фактору (шкалы — в блоках опросника). Уверенность H/M/L считается из твоих тегов Ф/О/Д. Балл — для очереди внимания, не для коммита бюджета."
    )
  );

  const result = computeScore(state.answers, state.scores);
  const grid = el("div", { class: "score-grid" });

  for (const f of result.perFactor) {
    const row = el("div", { class: "score-row" });
    const left = el("div", {});
    left.appendChild(el("div", { class: "score-row__name" }, `${f.name} · вес ${f.weight}%`));
    row.appendChild(left);

    const sel = el("select", {});
    sel.appendChild(el("option", { value: "" }, "— балл —"));
    for (let i = 1; i <= 5; i++) {
      const o = el("option", { value: String(i) }, String(i));
      if (f.score === i) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", (e) => {
      const v = e.target.value;
      if (v) state.scores[f.id] = Number(v);
      else delete state.scores[f.id];
      saveState();
      render();
    });
    row.appendChild(sel);

    row.appendChild(el("span", { class: `conf conf--${f.confidence}` }, `увер. ${f.confidence}`));
    grid.appendChild(row);
  }
  card.appendChild(grid);

  const totalWrap = el("div", { style: "margin-top:16px;" });
  if (result.total != null) {
    totalWrap.appendChild(el("div", { class: "step-meta" }, "Балл v0 (0–100)"));
    totalWrap.appendChild(el("div", { class: "score-total" }, String(result.total)));
  } else {
    totalWrap.appendChild(el("div", { class: "step-meta" }, "Проставь баллы, чтобы увидеть итог."));
  }
  card.appendChild(totalWrap);

  if (result.overclaim) {
    card.appendChild(
      el(
        "div",
        { class: "score-flag" },
        "⚠ Есть фактор с баллом >3 на уверенности L (догадка). По методологии: сначала проверь это допущение, не коммить бюджет."
      )
    );
  }

  return card;
}

function downloadMd(prompt) {
  const name = (state.answers.q1?.text || "проект").trim() || "проект";
  const safe = name.replace(/[^\wА-Яа-яЁё.-]+/g, "_");
  const content = `# ${promptTitle(state.answers)}\n\n\`\`\`\n${prompt}\n\`\`\`\n`;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const a = el("a", {
    href: URL.createObjectURL(blob),
    download: `${safe}_deep-research_промт.md`,
  });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

// ── Навигация ──
function renderNav() {
  const nav = el("div", { class: "nav" });
  const back = el(
    "button",
    { class: "btn btn--ghost", type: "button" },
    "← Назад"
  );
  back.disabled = state.step === 0;
  back.addEventListener("click", () => {
    if (state.step > 0) {
      state.step--;
      saveState();
      render();
    }
  });

  const dots = el(
    "div",
    { class: "nav__dots" },
    `Шаг ${state.step + 1} из ${STEPS.length}`
  );

  const isLastBlock = state.step === STEPS.length - 2;
  const isResult = state.step === STEPS.length - 1;
  const next = el(
    "button",
    { class: "btn", type: "button" },
    isResult ? "В начало" : isLastBlock ? "Собрать метапромт →" : "Далее →"
  );
  next.addEventListener("click", () => {
    if (isResult) state.step = 0;
    else state.step++;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  nav.appendChild(back);
  nav.appendChild(dots);
  nav.appendChild(next);
  return nav;
}

// ── Главный рендер ──
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const step = STEPS[state.step];
  if (step.id === "result") {
    app.appendChild(renderResultStep());
  } else {
    app.appendChild(renderBlockStep(step));
  }
  app.appendChild(renderNav());

  // Прогресс-бар
  const pct = Math.round((state.step / (STEPS.length - 1)) * 100);
  document.getElementById("progress-bar").style.width = pct + "%";
}

// ── Экспорт / импорт / сброс ──
function exportJson() {
  const payload = {
    version: "v1",
    savedAt: new Date().toISOString(),
    answers: state.answers,
    scores: state.scores,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const name = (state.answers.q1?.text || "проект").trim() || "проект";
  const safe = name.replace(/[^\wА-Яа-яЁё.-]+/g, "_");
  const a = el("a", {
    href: URL.createObjectURL(blob),
    download: `${safe}_опросник.json`,
  });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
  toast("Экспортировано");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state.answers = data.answers || {};
      state.scores = data.scores || {};
      state.step = 0;
      saveState();
      render();
      toast("Импортировано");
    } catch (e) {
      toast("Ошибка: не JSON");
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  if (!confirm("Стереть все ответы и начать заново?")) return;
  state.answers = {};
  state.scores = {};
  state.step = 0;
  for (const [id, v] of Object.entries(DEFAULTS)) {
    state.answers[id] = { text: String(v), tag: "" };
  }
  saveState();
  render();
  toast("Сброшено");
}

// ── Инициализация ──
function init() {
  loadState();
  document.getElementById("btn-export").addEventListener("click", exportJson);
  document.getElementById("btn-reset").addEventListener("click", resetAll);
  const fileInput = document.getElementById("file-import");
  document
    .getElementById("btn-import")
    .addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = "";
  });
  render();
}

init();
