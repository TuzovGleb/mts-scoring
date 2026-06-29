// Единый загрузчик зашифрованного ядра (схема опросника + генератор метапромта
// + скоринг + шаблон/разбор). Используется и Скорингом (app.js), и Проектами
// (projects.js), чтобы логика расшифровки не дублировалась и не расходилась.
import { unlock } from "./protected.js";

let _core = null;

// host — контейнер, куда unlock() рендерит форму пароля при необходимости.
// Возвращает расшифрованный ES-модуль ядра (кэшируется на время жизни страницы).
export async function loadCore(host) {
  if (_core) return _core;
  const code = await unlock("scoring-core", host);
  const blobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    _core = await import(blobUrl);
    return _core;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
