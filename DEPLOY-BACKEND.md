# Деплой бэкенда рассылки на Render

Цель: чтобы кнопка «Разослать» на https://tuzovgleb.github.io/mts-scoring/
реально уходила в Claude по API. Для старта — только Anthropic.

## Шаг 1. Получить ключ Anthropic
1. Зайти на https://platform.claude.com → Settings → API keys → Create key.
2. Скопировать ключ вида `sk-ant-...` (показывается один раз).

## Шаг 2. Задеплоить бэкенд на Render
1. Зарегистрироваться на https://render.com (можно через GitHub).
2. **New → Blueprint**.
3. Подключить репозиторий **TuzovGleb/mts-scoring**. Render найдёт `render.yaml`.
4. На шаге переменных вписать **ANTHROPIC_API_KEY** = твой `sk-ant-...` ключ
   (остальные переменные уже заданы в render.yaml).
5. **Apply / Create** → дождаться статуса **Live** (первый билд ~2–3 мин).
6. Скопировать публичный URL сервиса, вид: `https://mts-scoring-backend.onrender.com`.

### Проверка, что сервер жив
Открой в браузере `<URL>/api/health` — должно вернуться:
```json
{"ok":true,"providers":{"anthropic":{"label":"Claude (Anthropic)","enabled":true}, ...}}
```
`anthropic.enabled:true` = ключ подхватился.

## Шаг 3. Подключить сайт к бэкенду
1. Открыть https://tuzovgleb.github.io/mts-scoring/ → пройти опросник до экрана «Результат».
2. В карточке **«Рассылка по моделям»** в поле **URL бэкенда** вставить URL с Render.
3. Оставить галочку только на **Claude** (остальные без ключей ответят заглушкой).
4. Нажать **Разослать** → через 1–3 минуты появится отчёт со ссылками.

## Важно
- **Free-тариф Render засыпает** после ~15 мин простоя: первый запрос после паузы
  идёт ~50 сек (холодный старт). Дальше быстро.
- Deep research у Claude — платный по токенам. Следи за расходом в платформе.
- Добавить ещё модели позже: впиши их ключи в Environment на Render
  (`PERPLEXITY_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`) и сверь модель-id.
- Ключи нигде не коммитятся: `.env` в `.gitignore`, на Render — `sync:false`.
