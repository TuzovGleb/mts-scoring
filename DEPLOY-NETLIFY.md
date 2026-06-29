# Деплой Netlify-бэкенда рассылки (T10)

Бэкенд рассылки — это **две короткие функции** `/api/start` и `/api/check`
(см. `netlify/functions/`). Они только создают задачи у провайдеров и
спрашивают статус по id — «долгий» deep research (5 мин–2 ч) живёт у самого
провайдера (Parallel хранит `run_id`, OpenAI — `response id` в режиме
`background`). Поэтому хватает самого дешёвого тарифа Netlify, а вкладку
можно закрыть и вернуться позже.

Сайт (фронт) остаётся на GitHub Pages — Netlify публикует **только функции**.

---

## Шаг 1. Подключить репозиторий к Netlify

1. Зайди на https://app.netlify.com → **Add new site → Import an existing project**.
2. Выбери GitHub и репозиторий **`TuzovGleb/mts-scoring`**.
3. Настройки сборки (Netlify подхватит из `netlify.toml`, но проверь):
   - **Base directory:** пусто (корень репозитория).
   - **Functions directory:** `netlify/functions`.
   - **Publish directory:** `netlify/public` (там только заглушка — это норм).
   - Build command: можно оставить пустым.
4. Deploy. После сборки получишь адрес вида `https://<имя>.netlify.app`.

> Альтернатива через CLI: `npm i -g netlify-cli` → `netlify login` →
> из папки `scoring-app`: `netlify deploy --prod`.

---

## Шаг 2. Добавить ключи (Environment variables)

Site settings → **Environment variables** → Add a variable:

| Переменная | Значение | Обязательна |
|---|---|---|
| `PARALLEL_API_KEY` | ключ Parallel.ai | да, для Parallel |
| `OPENAI_API_KEY` | ключ OpenAI | да, для ChatGPT |
| `PARALLEL_PROCESSOR` | `ultra` | нет (дефолт `ultra`) |
| `OPENAI_MODEL` | напр. `gpt-5.1` | нет (есть дефолт) |

После добавления ключей нажми **Trigger deploy → Deploy site**, чтобы функции
подхватили переменные.

> **Важно:** ключи вводишь ты сам в интерфейсе Netlify. Я их не ввожу и не храню.
> Без ключей функции работают в **мок-режиме** (отдают заглушку) — это удобно,
> чтобы проверить маршрут до оплаты API.

---

## Шаг 3. Проверка, что бэкенд жив

Открой в браузере: `https://<имя>.netlify.app/api/start` (GET).
Должен вернуться JSON вида:

```json
{ "ok": true, "providers": {
  "parallel": { "label": "Parallel.ai", "enabled": true },
  "openai":   { "label": "ChatGPT (OpenAI)", "enabled": true }
}}
```

`enabled: true` означает, что ключ виден функции. Если `false` — ключа нет
(будет мок).

---

## Шаг 4. Прописать URL на сайте и сделать боевой прогон

1. Открой сайт → вкладка **Проекты** → открой проект (или собери оценку на
   «Скоринге», тогда проект создастся сам).
2. В блоке **«Deep research от моделей»** вставь URL бэкенда
   `https://<имя>.netlify.app` в поле «URL бэкенда (Netlify)» (сохранится).
3. Отметь модели (Parallel.ai и ChatGPT) → **«Разослать»**. Колонки встанут в
   статус «идёт». Можно закрыть вкладку.
4. Через несколько минут (Parallel `ultra` — минуты; бывает дольше) вернись на
   карточку → автопроверка при заходе подтянет готовое, либо нажми **«Проверить
   ответы»**. Появятся текст и источники по каждой модели; можно скачать `.md`
   или экспортировать всю карточку.

Готово — это полный e2e: ответы → метапромт → рассылка → сбор → сравнение → v1
и решение в карточке.

---

## Заметки

- **CORS** в функциях сейчас открыт (`*`). Если хочешь сузить до своего домена —
  поменяй `Access-Control-Allow-Origin` в `netlify/functions/start.mjs` и
  `check.mjs` на `https://tuzovgleb.github.io` и передеплой.
- **Render-бэкенд** (`backend/`) остаётся как запасной путь рассылки на экране
  «Скоринг» — Netlify его не заменяет, а дополняет.
- **Хранилище реестра** — пока localStorage браузера (механизм A). Общий доступ
  с разных устройств (Netlify Blobs) — отдельный этап D, позже.
- Если провайдер сменит формат ответа — правится только `netlify/providers.mjs`
  (пути `output.content`/`output.basis` у Parallel, `output_text`/`output[]` у
  OpenAI), фронт трогать не нужно.
