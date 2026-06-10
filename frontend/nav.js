// Общая шапка-навигация хаба MTS HackTeam. Подключается на всех страницах:
// renderNav("scoring" | "manifest" | "types" | "scales")
export function renderNavbar(active) {
  const tabs = [
    { id: "scoring", href: "index.html", label: "Скоринг" },
    { id: "manifest", href: "manifest.html", label: "Манифест" },
    { id: "types", href: "types.html", label: "Типы проектов" },
    { id: "scales", href: "scales.html", label: "Шкалы оценок" },
  ];
  const nav = document.createElement("nav");
  nav.className = "hub-nav";
  nav.innerHTML = tabs
    .map(
      (t) =>
        `<a href="${t.href}" class="hub-tab${t.id === active ? " is-active" : ""}">${t.label}</a>`
    )
    .join("");

  const topbar = document.querySelector(".topbar");
  const progress = topbar?.querySelector(".progress");
  if (progress) topbar.insertBefore(nav, progress);
  else topbar?.appendChild(nav);
}
