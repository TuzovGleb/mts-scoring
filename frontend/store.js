// Реестр проектов и активный проект. Хранилище инъектируется (localStorage в
// браузере, in-memory в тестах) — поэтому модуль тестируется в node без DOM.
//
// Модель проекта:
// { id, name, desc, createdAt, updatedAt, answers:{}, scores:{v0:{},v1:{}},
//   prompt:"", researches:[], synthesis:null, nextSteps:"", decision:null }

const PROJECTS_KEY = "hackteam:projects";
const ACTIVE_KEY = "hackteam:activeProject";
const LEGACY_KEY = "scoring-app:v1"; // старый одиночный черновик Скоринга
const MIGRATED_KEY = "hackteam:migrated";

let _seq = 0;
function uid() {
  _seq += 1;
  const rnd = Math.random().toString(36).slice(2, 7);
  return `p_${Date.now().toString(36)}${_seq.toString(36)}${rnd}`;
}

// Проект «пустой»: нет ни одного ответа с текстом и нет снапшота метапромта.
export function isBlank(p) {
  if (!p) return true;
  const ans = p.answers || {};
  const hasText = Object.keys(ans).some((k) => String((ans[k] && ans[k].text) || "").trim());
  return !hasText && !String(p.prompt || "").trim();
}

export function blankProject(partial = {}) {
  const ts = new Date().toISOString();
  return {
    id: partial.id || uid(),
    name: partial.name || "Без названия",
    desc: partial.desc || "",
    createdAt: partial.createdAt || ts,
    updatedAt: ts,
    answers: partial.answers || {},
    scores: {
      v0: (partial.scores && partial.scores.v0) || {},
      v1: (partial.scores && partial.scores.v1) || {},
    },
    prompt: partial.prompt || "",
    promptEdited: partial.promptEdited ?? false, // метапромт правили вручную в карточке
    researches: partial.researches || [],
    synthesis: partial.synthesis ?? null,
    nextSteps: partial.nextSteps || "",
    decision: partial.decision ?? null,
  };
}

export function createStore(storage) {
  const readJSON = (k, fb) => {
    try {
      const v = storage.getItem(k);
      return v ? JSON.parse(v) : fb;
    } catch {
      return fb;
    }
  };
  const writeJSON = (k, v) => storage.setItem(k, JSON.stringify(v));

  function readAll() {
    const arr = readJSON(PROJECTS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }
  function writeAll(arr) {
    writeJSON(PROJECTS_KEY, arr);
  }

  const api = {
    list() {
      return readAll()
        .slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },
    get(id) {
      return readAll().find((p) => p.id === id) || null;
    },
    create(partial = {}) {
      const p = blankProject(partial);
      const arr = readAll();
      arr.push(p);
      writeAll(arr);
      api.setActive(p.id);
      return p;
    },
    update(id, patch = {}) {
      const arr = readAll();
      const i = arr.findIndex((p) => p.id === id);
      if (i < 0) return null;
      const cur = arr[i];
      const next = { ...cur, ...patch, id: cur.id, updatedAt: new Date().toISOString() };
      // scores мёржим по-факторно, чтобы patch.scores.v0 не стирал v1.
      if (patch.scores) {
        next.scores = {
          v0: { ...cur.scores.v0, ...(patch.scores.v0 || {}) },
          v1: { ...cur.scores.v1, ...(patch.scores.v1 || {}) },
        };
      }
      arr[i] = next;
      writeAll(arr);
      return next;
    },
    rename(id, name) {
      return api.update(id, { name });
    },
    remove(id) {
      const arr = readAll().filter((p) => p.id !== id);
      writeAll(arr);
      if (api.getActiveId() === id) {
        api.setActive(arr.length ? api.list()[0].id : null);
      }
      return true;
    },
    getActiveId() {
      try {
        return storage.getItem(ACTIVE_KEY) || null;
      } catch {
        return null;
      }
    },
    setActive(id) {
      if (id) storage.setItem(ACTIVE_KEY, id);
      else storage.removeItem(ACTIVE_KEY);
      return id;
    },
    getActive() {
      const id = api.getActiveId();
      return id ? api.get(id) : null;
    },
    // Гарантирует активный проект: вернёт текущий, иначе первый, иначе создаст пустой.
    getOrCreateActive() {
      return api.getActive() || (api.list()[0] && api.setActive(api.list()[0].id) && api.getActive()) || api.create();
    },
    // Начать новую оценку: если активный проект пустой — переиспользовать его
    // (не плодить дубли), иначе создать новый и сделать активным.
    startNew() {
      const a = api.getActive();
      if (a && isBlank(a)) return a;
      return api.create();
    },
    // Одноразовая миграция старого черновика Скоринга в первый проект.
    migrateLegacy() {
      if (storage.getItem(MIGRATED_KEY)) return null;
      const legacy = readJSON(LEGACY_KEY, null);
      storage.setItem(MIGRATED_KEY, "1");
      if (!legacy || !legacy.answers || !Object.keys(legacy.answers).length) return null;
      const name = (legacy.answers.q1 && legacy.answers.q1.text) || "Импортированный черновик";
      return api.create({
        name,
        answers: legacy.answers,
        scores: { v0: legacy.scores || {}, v1: {} },
      });
    },
  };
  return api;
}

// In-memory хранилище (для тестов и фолбэка вне браузера).
export function memoryStorage(seed = {}) {
  const m = { ...seed };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => {
      m[k] = String(v);
    },
    removeItem: (k) => {
      delete m[k];
    },
    _dump: () => ({ ...m }),
  };
}

// Стор по умолчанию: localStorage в браузере, иначе in-memory.
const defaultStorage =
  typeof localStorage !== "undefined" ? localStorage : memoryStorage();
export const store = createStore(defaultStorage);
