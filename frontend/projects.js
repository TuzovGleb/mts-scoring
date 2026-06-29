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

init();

async function init() {
  core = await loadCore(host); // пароль-гейт + ядро (FACTORS/computeScore для итога v0)
  window.addEventListener("hashchange", route);
  route();
}

function route() {
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
    const raw = window.prompt("Название проекта:", "Новый проект");
    if (raw === null) return;
    const name = raw.trim() || "Без названия";
    const p = store.create({ name });
    go(`#p/${encodeURIComponent(p.id)}`);
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
  card.appendChild(actions);

  card.appendChild(
    eln(
      "div",
      "step-intro",
      "Карточка проекта. Блоки (оценка v0, документы, deep research, синтез, оценка v1, следующие шаги, решение) появятся здесь по мере готовности."
    )
  );

  host.appendChild(card);
}
