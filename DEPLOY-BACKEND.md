# Подключение рассылки в Deep Research (ChatGPT + Parallel.ai)

Цель: на сайте https://tuzovgleb.github.io/mts-scoring/ (вкладка **Скоринг** →
экран «Результат» → блок «Рассылка по моделям») кнопка **«Разослать»** реально
отправляет метапромт по API в **ChatGPT** и **Parallel.ai** и собирает ответы.

GitHub Pages — только статика, поэтому нужен отдельный маленький сервер (бэкенд),
который держит ключи у себя и ходит в API. Разворачиваем его на Render.

## Шаг 1. Получить API-ключи

- **Parallel.ai:** https://platform.parallel.ai → войти → **API Keys** → Create.
  Скопировать ключ. (Тариф с оплатой за задачи; deep-research — процессор `ultra`.)
- **OpenAI (ChatGPT):** https://platform.openai.com/api-keys → Create new secret key.
  Нужен платёжный баланс на аккаунте OpenAI.

## Шаг 2. Развернуть бэкенд на Render

1. Зарегистрироваться на https://render.com (можно через GitHub).
2. **New → Blueprint** → подключить репозиторий **TuzovGleb/mts-scoring**
   (Render сам найдёт `render.yaml`).
3. На шаге переменных вписать:
   - **PARALLEL_API_KEY** = ключ Parallel
   - **OPENAI_API_KEY** = ключ OpenAI
   (остальные переменные уже заданы в `render.yaml`).
4. **Apply / Create** → дождаться статуса **Live** (первый билд ~2–3 мин).
5. Скопировать публичный URL сервиса, вид: `https://mts-scoring-backend.onrender.com`.

### Проверка, что сервер видит ключи
Открой `<URL>/api/health` — в JSON у `parallel` и `openai` должно быть `"enabled": true`.

## Шаг 3. Подключить сайт к бэкенду

1. Открыть сайт → вкладка **Скоринг** → пройти/вставить ответы → экран «Результат».
2. В блоке **«Рассылка по моделям»** в поле **URL бэкенда** вставить URL с Render.
3. Галочки уже стоят на **Parallel.ai** и **ChatGPT**.
4. Нажать **«Разослать»** → ответы появятся в колонках (deep research идёт минутами —
   колонки обновляются по мере готовности).

## Как это устроено

- `POST /api/research { prompt, models[], project }` → бэкенд запускает выбранные
  провайдеры **параллельно**, возвращает `jobId`; фронт опрашивает `GET /api/research/:jobId`.
- **Parallel.ai** (`backend/providers/parallel.js`): создаёт task run (`processor=ultra`),
  поллит статус, забирает `output.content` + источники из `output.basis`.
- **ChatGPT** (`backend/providers/openai.js`): Responses API с инструментом `web_search`.
- Каждый ответ сохраняется в `data/<проект>_<модель>_<дата>.md`.

## Важно

- **Free-тариф Render засыпает** после ~15 мин простоя: первый запрос идёт ~50 сек.
- Deep research **платный по использованию** у обоих провайдеров — следи за расходом.
- **Parallel `ultra` думает минутами** (до ~десятков минут на сложных задачах) — это норма,
  колонка висит в статусе «идёт», бэкенд ждёт результат.
- Ключи нигде не коммитятся: `.env` в `.gitignore`, на Render — `sync:false`.
- Добавить ещё модели (Gemini/Claude) — впиши их ключи в Environment на Render
  и отметь галочки на сайте.
