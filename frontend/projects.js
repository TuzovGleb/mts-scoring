// Вкладка «Проекты» — реестр оценённых проектов (каркас, T3).
// Список + создание; открытие/карточка/операции добавляются в T5–T8.
import { renderNavbar } from "./nav.js";
import { loadCore } from "./core-loader.js";
import { store } from "./store.js";

renderNavbar("projects");
const host = document.getElementById("app");

init();

async function init() {
  await loadCore(host); // пароль-гейт + ядро (понадобится в T6–T7 для факторов)
  render();
}

function eln(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function render() {
  host.innerHTML = "";
  const card = eln("div", "card");

  const head = eln("div", "step-head");
  head.appendChild(eln("h2", null, "Проекты"));
  card.appendChild(head);

  const actions = eln("div", "result-actions");
  const newBtn = eln("button", "btn btn--sm", "Новый проект");
  newBtn.type = "button";
  newBtn.addEventListener("click", () => {
    const raw = window.prompt("Название проекта:", "Новый проект");
    if (raw === null) return;
    const name = raw.trim() || "Без названия";
    store.create({ name });
    render();
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
    for (const p of list) {
      const row = eln("div", "proj-row");
      row.appendChild(eln("span", "proj-row__name", p.name));
      const date = new Date(p.updatedAt).toLocaleDateString("ru-RU");
      row.appendChild(eln("span", "proj-row__meta", p.desc ? `${p.desc} · ${date}` : date));
      wrap.appendChild(row);
    }
    card.appendChild(wrap);
  }

  host.appendChild(card);
}
