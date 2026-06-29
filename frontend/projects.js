// Вкладка «Проекты» — реестр оценённых проектов (T5).
// Список с операциями (открыть/переименовать/удалить) + карточка-оболочка.
// Блоки карточки (v0, документы, deep research, синтез, v1, шаги, решение,
// экспорт) наполняются в T6–T8. Навигация — через location.hash (#p/<id>),
// чтобы перезагрузка/возврат сохраняли открытую карточку.
import { renderNavbar } from "./nav.js";
import { loadCore } from "./core-loader.js";
import { store } from "./store.js";

renderNavbar("projects");
const host = document.getElementById("app");
let core = null;

const DECISIONS = ["Делаем", "Валидируем", "Спинофф", "Не делаем"];

// Рассылка deep research (режим Netlify, механизм A — проверка из браузера).
// Render-путь живёт отдельно на экране «Скоринг» и здесь не дублируется.
const RESEARCH_MODELS = [
  { name: "parallel", label: "Parallel.ai" },
  { name: "openai", label: "ChatGPT (OpenAI)" },
];
const NETLIFY_URL_KEY = "hackteam:netlifyUrl";
const POLL_MS = 10 * 60 * 1000; // автопроверка раз в ~10 мин, пока вкладка открыта
let pollTimer = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

init();

async function init() {
  core = await loadCore(host); // пароль-гейт + ядро (FACTORS/computeScore для итога v0)
  window.addEventListener("hashchange", route);
  route();
}

function route() {
  stopPolling(); // навигация сбрасывает автопроверку прошлой карточки
  const m = location.hash.match(/^#p\/(.+)$/);
  if (m) {
    const p = store.get(decodeURIComponent(m[1]));
    if (p) {
      store.setActive(p.id);
      renderCard(p);
      return;
    }
  }
  renderList();
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash; // вызовет hashchange → route
}

function eln(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Итог оценки v0 проекта (0–100) или null, если не считается.
function v0Total(p) {
  const scores = (p.scores && p.scores.v0) || {};
  if (!Object.keys(scores).length) return null;
  try {
    return core.computeScore(p.answers || {}, scores).total;
  } catch {
    return null;
  }
}

// Имя файла из названия проекта (безопасное).
function safeName(p) {
  const name = (p.name || "проект").trim() || "проект";
  return name.replace(/[^\wА-Яа-яЁё.-]+/g, "_");
}

// Скачать текст файлом (Blob + временная ссылка).
function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = eln("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

// ===== Список =====
function renderList() {
  host.innerHTML = "";
  const card = eln("div", "card");

  const head = eln("div", "step-head");
  head.appendChild(eln("h2", null, "Проекты"));
  head.appendChild(
    eln("div", "step-meta", "Реестр оценённых проектов. Открой проект, чтобы увидеть карточку.")
  );
  card.appendChild(head);

  const actions = eln("div", "result-actions");
  const newBtn = eln("button", "btn btn--sm", "Новый проект");
  newBtn.type = "button";
  newBtn.addEventListener("click", () => {
    // Новая оценка начинается с анкеты: создаём (или переиспользуем пустой) проект
    // и ведём в Скоринг. Имя подставится из первого вопроса при заполнении.
    store.startNew();
    location.href = "scoring.html";
  });
  actions.appendChild(newBtn);
  card.appendChild(actions);

  const list = store.list();
  if (!list.length) {
    card.appendChild(
      eln(
        "div",
        "step-intro",
        "Пока нет проектов. Нажми «Новый проект» или собери оценку на вкладке «Скоринг»."
      )
    );
  } else {
    const wrap = eln("div", "proj-list");
    for (const p of list) wrap.appendChild(renderRow(p));
    card.appendChild(wrap);
  }

  host.appendChild(card);
}

function renderRow(p) {
  const row = eln("div", "proj-row proj-row--clickable");
  row.tabIndex = 0;
  const open = () => go(`#p/${encodeURIComponent(p.id)}`);
  row.addEventListener("click", open);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter") open();
  });

  const main = eln("div", "proj-row__main");
  main.appendChild(eln("span", "proj-row__name", p.name || "Без названия"));

  const bits = [];
  const total = v0Total(p);
  if (total != null) bits.push(`v0 · ${total}/100`);
  if (p.decision) bits.push(p.decision);
  if (p.desc) bits.push(p.desc);
  bits.push(new Date(p.updatedAt).toLocaleDateString("ru-RU"));
  main.appendChild(eln("span", "proj-row__meta", bits.join("  ·  ")));
  row.appendChild(main);

  const ops = eln("div", "proj-row__ops");
  const renameBtn = eln("button", "btn btn--ghost btn--sm", "Переименовать");
  renameBtn.type = "button";
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const raw = window.prompt("Новое название:", p.name || "");
    if (raw === null) return;
    const name = raw.trim() || "Без названия";
    store.rename(p.id, name);
    renderList();
  });
  const delBtn = eln("button", "btn btn--ghost btn--sm proj-row__del", "Удалить");
  delBtn.type = "button";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить проект «${p.name || "Без названия"}»? Это необратимо.`)) return;
    store.remove(p.id);
    renderList();
  });
  ops.appendChild(renameBtn);
  ops.appendChild(delBtn);
  row.appendChild(ops);

  return row;
}

// ===== Карточка (оболочка; блоки наполняются в T6–T8) =====
function renderCard(p) {
  host.innerHTML = "";
  const card = eln("div", "card");

  const back = eln("button", "btn btn--ghost btn--sm proj-back", "← Все проекты");
  back.type = "button";
  back.addEventListener("click", () => go("#"));
  card.appendChild(back);

  const head = eln("div", "step-head");
  head.appendChild(eln("h2", null, p.name || "Без названия"));
  if (p.desc) head.appendChild(eln("div", "step-meta", p.desc));
  card.appendChild(head);

  const actions = eln("div", "result-actions");
  const editBtn = eln("a", "btn btn--sm", "Редактировать в Скоринге");
  editBtn.href = "scoring.html"; // Скоринг работает с активным проектом (он уже активен)
  actions.appendChild(editBtn);
  const exportBtn = eln("button", "btn btn--sm btn--ghost", "Экспорт карточки .md");
  exportBtn.type = "button";
  exportBtn.addEventListener("click", () => {
    const fresh = store.get(p.id) || p; // взять актуальные значения (автосейв мог обновить)
    downloadText(`${safeName(fresh)}_карточка.md`, buildCardMd(fresh), "text/markdown");
  });
  actions.appendChild(exportBtn);
  card.appendChild(actions);

  card.appendChild(renderV0Block(p));
  card.appendChild(renderDocsBlock(p));
  card.appendChild(renderResearchBlock(p));
  card.appendChild(renderSynthesisBlock(p));
  card.appendChild(renderV1Block(p));
  card.appendChild(renderNextStepsBlock(p));
  card.appendChild(renderDecisionBlock(p));

  host.appendChild(card);
}

function netlifyUrl() {
  try {
    return (localStorage.getItem(NETLIFY_URL_KEY) || "").trim();
  } catch {
    return "";
  }
}
function statusRu(s) {
  return { running: "идёт", done: "готово", error: "ошибка" }[s] || s || "—";
}
function modelLabel(name) {
  return (RESEARCH_MODELS.find((m) => m.name === name) || {}).label || name;
}

// Блок «Deep research от моделей» — рассылка метапромта (режим Netlify) и сбор
// ответов. Механизм A: проверка при заходе + автопроверка ~10 мин (пока вкладка
// открыта) + ручная кнопка «Проверить». providerId хранятся в project.researches,
// поэтому можно закрыть вкладку и вернуться — долгий ресёрч живёт у провайдера.
function renderResearchBlock(p) {
  const sec = eln("section", "card-block");
  sec.appendChild(blockHead("Deep research от моделей", "Netlify · ChatGPT + Parallel.ai"));

  // Перерисовка только этого блока (не всей карточки — чтобы не сбивать ввод в др. блоках).
  const paint = () => {
    const fresh = store.get(p.id) || p;
    body.innerHTML = "";
    body.appendChild(renderResearchBody(fresh, paint));
    armPolling(fresh, paint);
  };
  const body = eln("div");
  sec.appendChild(body);
  paint();
  return sec;
}

function renderResearchBody(p, paint) {
  const wrap = eln("div");
  const researches = (p.researches || []).filter(Boolean);
  const running = researches.some((r) => r.status === "running");

  // URL бэкенда Netlify.
  const urlField = eln("div", "field");
  urlField.appendChild(eln("label", "field__label", "URL бэкенда (Netlify)"));
  const urlInput = eln("input");
  urlInput.type = "text";
  urlInput.placeholder = "https://<site>.netlify.app";
  urlInput.value = netlifyUrl();
  urlInput.addEventListener("input", (e) => {
    try {
      localStorage.setItem(NETLIFY_URL_KEY, e.target.value.trim());
    } catch {}
  });
  urlField.appendChild(urlInput);
  wrap.appendChild(urlField);

  // Выбор моделей.
  const picker = eln("div", "dispatch-models");
  const chosen = new Set(RESEARCH_MODELS.map((m) => m.name)); // по умолчанию обе
  for (const m of RESEARCH_MODELS) {
    const lbl = eln("label", "checkbox");
    const cb = eln("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.addEventListener("change", (e) => {
      if (e.target.checked) chosen.add(m.name);
      else chosen.delete(m.name);
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(" " + m.label));
    picker.appendChild(lbl);
  }
  wrap.appendChild(picker);

  // Кнопки.
  const actions = eln("div", "result-actions");
  const sendBtn = eln("button", "btn btn--sm", running ? "Рассылка идёт…" : "Разослать");
  sendBtn.type = "button";
  sendBtn.disabled = running;
  sendBtn.addEventListener("click", () => dispatchResearch(p, [...chosen], paint));
  actions.appendChild(sendBtn);

  if (researches.length) {
    const checkBtn = eln("button", "btn btn--sm btn--ghost", "Проверить ответы");
    checkBtn.type = "button";
    checkBtn.addEventListener("click", () => checkResearch(p, paint));
    actions.appendChild(checkBtn);
  }
  wrap.appendChild(actions);

  // Статус-строка.
  if (!netlifyUrl()) {
    wrap.appendChild(
      eln("div", "field__hint", "Укажи URL Netlify-бэкенда (после деплоя, T10). Без ключей провайдеры вернут заглушку.")
    );
  }

  // Колонки результатов.
  if (!researches.length) {
    wrap.appendChild(eln("div", "step-intro stub", "Ещё не запускалось. Нажми «Разослать»."));
    return wrap;
  }

  const cols = eln("div", "research-cols");
  for (const r of researches) {
    const col = eln("div", "research-col");
    const head = eln("div", "research-col__head");
    head.appendChild(eln("span", "research-col__name", modelLabel(r.model)));
    head.appendChild(eln("span", `research-col__status research-col__status--${r.status}`, statusRu(r.status) + (r.mock ? " · мок" : "")));
    col.appendChild(head);

    if (r.status === "error") {
      col.appendChild(eln("div", "score-flag", r.error || "Ошибка"));
    } else if (r.status === "done") {
      const pre = eln("pre", "research-col__text", r.text || "(пусто)");
      col.appendChild(pre);
      if (r.sources && r.sources.length) {
        const src = eln("div", "research-col__sources");
        src.appendChild(eln("div", "field__hint", "Источники:"));
        for (const s of r.sources) {
          const a = eln("a");
          a.href = s.url || "#";
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = s.title || s.url || "ссылка";
          src.appendChild(a);
        }
        col.appendChild(src);
      }
      const dl = eln("button", "btn btn--ghost btn--sm", "Скачать .md");
      dl.type = "button";
      dl.addEventListener("click", () => {
        const md = `# ${modelLabel(r.model)} — deep research\n\n${r.text || ""}\n`;
        downloadText(`${safeName(p)}_${r.model}.md`, md, "text/markdown");
      });
      col.appendChild(dl);
    } else {
      col.appendChild(eln("div", "step-intro", "Задача создана, ответ ещё готовится. Можно закрыть вкладку и вернуться позже."));
    }
    cols.appendChild(col);
  }
  wrap.appendChild(cols);
  return wrap;
}

// Включает автопроверку, если есть незавершённые задачи (механизм A).
function armPolling(p, paint) {
  stopPolling();
  const running = (p.researches || []).some((r) => r && r.status === "running");
  if (!running) return;
  // Проверка при заходе на экран (один раз, мягко).
  checkResearch(p, paint, true);
  pollTimer = setInterval(() => checkResearch(p, paint, true), POLL_MS);
}

async function dispatchResearch(p, models, paint) {
  const url = netlifyUrl();
  if (!url) {
    window.alert("Сначала укажи URL Netlify-бэкенда.");
    return;
  }
  if (!models.length) {
    window.alert("Отметь хотя бы одну модель.");
    return;
  }
  const prompt = (p.prompt && p.prompt.trim()) || core.buildPrompt(p.answers || {});
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, models }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const researches = (data.jobs || []).map((j) => ({
      model: j.model,
      providerId: j.providerId || null,
      status: j.status || (j.error ? "error" : "running"),
      text: "",
      sources: [],
      error: j.error || null,
      mock: !!j.mock,
    }));
    store.update(p.id, { researches });
  } catch (e) {
    window.alert("Не удалось разослать: " + (e?.message || e));
  }
  paint();
}

async function checkResearch(p, paint, silent = false) {
  const url = netlifyUrl();
  const jobs = (store.get(p.id)?.researches || []).filter(Boolean);
  if (!url || !jobs.length) {
    if (!silent) window.alert("Нечего проверять или не задан URL.");
    return;
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobs: jobs.map((j) => ({ model: j.model, providerId: j.providerId, status: j.status })) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    // Сливаем обновления по модели, сохраняя исходные поля.
    const byModel = Object.fromEntries((data.jobs || []).map((j) => [j.model, j]));
    const merged = jobs.map((j) => ({ ...j, ...(byModel[j.model] || {}) }));
    store.update(p.id, { researches: merged });
  } catch (e) {
    if (!silent) window.alert("Не удалось проверить: " + (e?.message || e));
    return;
  }
  paint();
}

// Блок «Интегрированный синтез» — заглушка (этап D, позже).
function renderSynthesisBlock(p) {
  const sec = eln("section", "card-block");
  sec.appendChild(blockHead("Интегрированный синтез"));
  sec.appendChild(
    eln(
      "div",
      "step-intro stub",
      "Сводный отчёт по ответам моделей появится позже — после сбора deep research."
    )
  );
  return sec;
}

// ── Экспорт карточки одним .md ──
function scoreSection(title, answers, scores) {
  const r = core.computeScore(answers, scores || {});
  const lines = [`## ${title}`];
  if (!r.perFactor.some((f) => f.score != null)) {
    lines.push("_не проставлено_");
    return lines.join("\n");
  }
  for (const f of r.perFactor) {
    const s = f.score != null ? f.score : "—";
    lines.push(`- ${f.name} (вес ${f.weight}%): ${s} · увер. ${f.confidence}`);
  }
  if (r.total != null) lines.push(`\n**Итог: ${r.total}/100**`);
  if (r.overclaim) lines.push(`\n⚠ Есть балл >3 на уверенности L — сначала проверь допущение.`);
  return lines.join("\n");
}

function buildCardMd(p) {
  const answers = p.answers || {};
  const out = [];
  out.push(`# ${p.name || "Без названия"}`);
  if (p.desc) out.push(`\n${p.desc}`);

  out.push(`\n${scoreSection("Оценка v0", answers, (p.scores && p.scores.v0) || {})}`);

  out.push(`\n## Deep research от моделей`);
  const researches = (p.researches || []).filter(Boolean);
  if (!researches.length) {
    out.push("_не запускалось_");
  } else {
    for (const r of researches) {
      out.push(`\n### ${r.model || "модель"} — ${r.status || "—"}`);
      if (r.text) out.push(r.text);
      if (r.sources && r.sources.length) {
        out.push("\nИсточники:");
        for (const s of r.sources) out.push(`- ${s}`);
      }
    }
  }

  out.push(`\n## Интегрированный синтез\n_появится позже_`);

  out.push(`\n${scoreSection("Оценка v1", answers, (p.scores && p.scores.v1) || {})}`);

  out.push(`\n## Следующие шаги\n${p.nextSteps ? p.nextSteps : "_—_"}`);
  out.push(`\n## Решение\n${p.decision ? p.decision : "_не принято_"}`);

  const prompt = (p.prompt && p.prompt.trim()) || core.buildPrompt(answers);
  out.push(`\n## Метапромт deep-research\n\`\`\`\n${prompt}\n\`\`\``);

  return out.join("\n") + "\n";
}

// ===== Карточка (оболочка; блоки наполняются в T6–T8) =====

// Заголовок блока внутри карточки.
function blockHead(title, sub) {
  const h = eln("div", "card-block__head");
  h.appendChild(eln("h3", "card-block__title", title));
  if (sub) h.appendChild(eln("span", "card-block__sub", sub));
  return h;
}

// Блок «Оценка v0» — баллы по факторам (read-only) + итог + флаг overclaim.
// Правка баллов — в Скоринге; здесь только показываем снимок.
function renderV0Block(p) {
  const sec = eln("section", "card-block");
  sec.appendChild(blockHead("Оценка v0", "из вкладки «Скоринг»"));

  const scores = (p.scores && p.scores.v0) || {};
  const result = core.computeScore(p.answers || {}, scores);
  const anyScore = result.perFactor.some((f) => f.score != null);

  if (!anyScore) {
    sec.appendChild(
      eln("div", "step-intro", "Баллы ещё не проставлены. Открой проект в Скоринге и оцени факторы.")
    );
    return sec;
  }

  const grid = eln("div", "score-grid");
  for (const f of result.perFactor) {
    const row = eln("div", "score-row");
    const left = eln("div");
    left.appendChild(eln("div", "score-row__name", `${f.name} · вес ${f.weight}%`));
    row.appendChild(left);
    row.appendChild(eln("span", "score-val", f.score != null ? String(f.score) : "—"));
    row.appendChild(eln("span", `conf conf--${f.confidence}`, `увер. ${f.confidence}`));
    grid.appendChild(row);
  }
  sec.appendChild(grid);

  const totalWrap = eln("div");
  totalWrap.style.marginTop = "14px";
  if (result.total != null) {
    totalWrap.appendChild(eln("div", "step-meta", "Балл v0 (0–100)"));
    totalWrap.appendChild(eln("div", "score-total", String(result.total)));
  }
  sec.appendChild(totalWrap);

  if (result.overclaim) {
    sec.appendChild(
      eln(
        "div",
        "score-flag",
        "⚠ Есть фактор с баллом >3 на уверенности L (догадка). По методологии: сначала проверь это допущение, не коммить бюджет."
      )
    );
  }
  return sec;
}

// Блок «Документы» — скачать ответы (.json) и метапромт (.md).
function renderDocsBlock(p) {
  const sec = eln("section", "card-block");
  sec.appendChild(blockHead("Документы"));

  const hasAnswers = p.answers && Object.keys(p.answers).length > 0;
  if (!hasAnswers) {
    sec.appendChild(
      eln("div", "step-intro", "Пока нет ответов опросника — заполни проект в Скоринге.")
    );
    return sec;
  }

  const actions = eln("div", "result-actions");

  const jsonBtn = eln("button", "btn btn--ghost btn--sm", "Скачать ответы .json");
  jsonBtn.type = "button";
  jsonBtn.addEventListener("click", () => {
    const payload = {
      version: "v1",
      project: p.name,
      savedAt: new Date().toISOString(),
      answers: p.answers,
      scores: (p.scores && p.scores.v0) || {},
    };
    downloadText(`${safeName(p)}_опросник.json`, JSON.stringify(payload, null, 2), "application/json");
  });
  actions.appendChild(jsonBtn);

  const mdBtn = eln("button", "btn btn--ghost btn--sm", "Скачать метапромт .md");
  mdBtn.type = "button";
  // Снимок промта приоритетен (зафиксирован на экране «Результат»); иначе строим заново.
  const prompt = (p.prompt && p.prompt.trim()) || core.buildPrompt(p.answers || {});
  mdBtn.addEventListener("click", () => {
    const content = `# ${core.promptTitle(p.answers || {})}\n\n\`\`\`\n${prompt}\n\`\`\`\n`;
    downloadText(`${safeName(p)}_deep-research_промт.md`, content, "text/markdown");
  });
  actions.appendChild(mdBtn);

  sec.appendChild(actions);
  return sec;
}

// Блок «Оценка v1» — ручной ввод баллов 1–5 после deep research (тот же
// computeScore, что и v0; уверенность H/M/L — из тегов ответов). Автосейв.
function renderV1Block(p) {
  const sec = eln("section", "card-block");
  sec.appendChild(blockHead("Оценка v1", "после deep research — проставь баллы заново"));

  const v1 = { ...((p.scores && p.scores.v1) || {}) };
  const answers = p.answers || {};

  const totalWrap = eln("div");
  totalWrap.style.marginTop = "14px";
  const flagWrap = eln("div");

  function refreshTotal() {
    const r = core.computeScore(answers, v1);
    totalWrap.innerHTML = "";
    if (r.total != null) {
      totalWrap.appendChild(eln("div", "step-meta", "Балл v1 (0–100)"));
      totalWrap.appendChild(eln("div", "score-total", String(r.total)));
    } else {
      totalWrap.appendChild(eln("div", "step-meta", "Проставь баллы, чтобы увидеть итог v1."));
    }
    flagWrap.innerHTML = "";
    if (r.overclaim) {
      flagWrap.appendChild(
        eln(
          "div",
          "score-flag",
          "⚠ Балл >3 на уверенности L (догадка). Сначала проверь допущение, не коммить бюджет."
        )
      );
    }
  }

  const grid = eln("div", "score-grid");
  const base = core.computeScore(answers, v1); // имена факторов и уверенность
  for (const f of base.perFactor) {
    const row = eln("div", "score-row");
    const left = eln("div");
    left.appendChild(eln("div", "score-row__name", `${f.name} · вес ${f.weight}%`));
    row.appendChild(left);

    const sel = eln("select");
    const zero = eln("option", null, "— балл —");
    zero.value = "";
    sel.appendChild(zero);
    for (let i = 1; i <= 5; i++) {
      const o = eln("option", null, String(i));
      o.value = String(i);
      if (f.score === i) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", (e) => {
      const v = e.target.value;
      if (v) v1[f.id] = Number(v);
      else delete v1[f.id];
      store.update(p.id, { scores: { v1 } });
      refreshTotal();
    });
    row.appendChild(sel);
    row.appendChild(eln("span", `conf conf--${f.confidence}`, `увер. ${f.confidence}`));
    grid.appendChild(row);
  }
  sec.appendChild(grid);
  sec.appendChild(totalWrap);
  sec.appendChild(flagWrap);
  refreshTotal();
  return sec;
}

// Блок «Следующие шаги» — свободный текст. Автосейв на ввод (без перерисовки).
function renderNextStepsBlock(p) {
  const sec = eln("section", "card-block");
  sec.appendChild(blockHead("Следующие шаги"));
  const ta = eln("textarea");
  ta.value = p.nextSteps || "";
  ta.placeholder = "Что делаем дальше: проверки гипотез, RAT-тесты, кому показать, дедлайны…";
  ta.addEventListener("input", () => {
    store.update(p.id, { nextSteps: ta.value });
  });
  sec.appendChild(ta);
  return sec;
}

// Блок «Решение» — выбор одной из четырёх опций. Повторный клик снимает выбор.
function renderDecisionBlock(p) {
  const sec = eln("section", "card-block");
  sec.appendChild(blockHead("Решение"));

  let current = p.decision || null;
  const opts = eln("div", "decision-opts");
  const btns = [];
  for (const d of DECISIONS) {
    const b = eln("button", "decision-opt", d);
    b.type = "button";
    if (d === current) b.classList.add("decision-opt--on");
    b.addEventListener("click", () => {
      current = current === d ? null : d;
      store.update(p.id, { decision: current });
      for (const x of btns) x.el.classList.toggle("decision-opt--on", x.d === current);
    });
    btns.push({ el: b, d });
    opts.appendChild(b);
  }
  sec.appendChild(opts);
  return sec;
}
