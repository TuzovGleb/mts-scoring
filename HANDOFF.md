# HANDOFF — продолжение работы над MTS HackTeam scoring-app

Документ для возобновления в новой сессии. Прочитай его + план
`C:\Users\ASUS\.claude\plans\humming-finding-curry.md` (там тикеты T0–T10).

## Что это
Сайт-хаб «MTS HackTeam»: методология выбора проектов (контент под паролем) +
инструмент скоринга (опросник → deep-research метапромт v6 → рассылка по ИИ →
карточка проекта с жизненным циклом). Превращается в реестр оценённых проектов.

- **Прод:** https://tuzovgleb.github.io/mts-scoring/  · **пароль сайта:** `Tuzov123!`
- **Репозиторий:** github.com/TuzovGleb/mts-scoring (аккаунт TuzovGleb, gh авторизован)
- **Деплой фронта:** GitHub Actions публикует `frontend/` на push в main (Pages).
- **Рабочая папка:** `C:\Users\ASUS\Desktop\Claude\claude cowork\МТС\scoring-app`

## Структура
```
frontend/                 ← статика (деплоится на Pages)
  index.html(Суть) manifest/types(Суть оценки)/scales/scoring/projects .html
  app.js          — Скоринг (опросник, метапромт, рассылка). Работает с активным проектом.
  projects.js     — вкладка «Проекты» (реестр; пока каркас — список+создать)
  store.js        — реестр проектов в localStorage (CRUD, активный, миграция)
  core-loader.js  — единый загрузчик зашифрованного ядра (unlock→import)
  protected.js    — пароль + AES-GCM расшифровка
  nav.js          — вкладки: Суть·Манифест·Суть оценки·Шкалы·Скоринг·Проекты
  content/*.enc.json — ЗАШИФРОВАННЫЕ блобы (методология + ядро скоринга)
content-src/      ← ОТКРЫТЫЙ текст для шифрования (в .gitignore, НЕ в репо!)
  about/manifest/types/scales .html — страницы методологии (Финальные 2, без Тип1/2)
  scoring-core.js — ЯДРО: BLOCKS(опросник), FACTORS(веса 25/25/20/20/10),
                    buildPrompt(v6), computeScore, buildTemplate/parseTemplate
tools/encrypt-content.mjs — PBKDF2+AES-GCM: content-src/* → frontend/content/*.enc.json
backend/          ← Express-бэкенд под Render (ЗАПАСНОЙ путь рассылки, не трогаем)
netlify/          ← Netlify-бэкенд рассылки (start/check) — для механизма A
  providers.mjs, functions/start.mjs, functions/check.mjs ; netlify.toml
tests/            ← npm test (node:test): scoring-core, store, netlify-mock (19 тестов)
data/             ← локальные данные, пароль (data/ПАРОЛЬ_сайта.txt), в .gitignore
```

## Команды
- Тесты: `cd scoring-app && npm test` (должно быть зелёным перед каждым коммитом).
- Перешифровать ядро/контент после правок `content-src/`:
  `node tools/encrypt-content.mjs "$(cat data/ПАРОЛЬ_сайта.txt)"` (пароль = `Tuzov123!`).
- Превью локально: Claude preview (launch.json «frontend», порт 5055) или `npx serve frontend`.
- Деплой: `git add -A && git commit && git push` → Actions → проверить `gh run watch`.

## Важные правила
- **Методология зашифрована.** Правки текста/опросника/промта делаешь в `content-src/`,
  потом ПЕРЕШИФРОВЫВАЕШЬ (иначе на сайте старое). В репо — только `*.enc.json`.
- **Ничего приватного в публичный репо.** `content-src/` и `data/` в `.gitignore`.
- Каждый тикет: `npm test` зелёный + регресс-смоук + чистая консоль + отдельный коммит.
- Регресс-смоук: вкладки контента расшифровываются; Скоринг — «Быстрый ввод» парсит
  «Поле: ответ», проход по шагам, метапромт v6 с блоками G и H собирается.

## Модель проекта (store.js, localStorage)
`{ id, name, desc, createdAt, updatedAt, answers, scores:{v0,v1}, prompt,
   researches:[{model,providerId,status,text,sources,error}], synthesis:null,
   nextSteps, decision }`
Ключи: `hackteam:projects`, `hackteam:activeProject`, `hackteam:migrated`.
Шаг навигации Скоринга: `scoring-app:step`.

## Прогресс (тикеты)
СДЕЛАНО и задеплоено:
- T0 тест-харнес · T1 store.js · T2 core-loader · T3 вкладка «Проекты» (каркас)
- T4 Скоринг пишет в активный проект + миграция старого черновика (проверено).
- T5 реестр: список с мета (v0 итог · решение · описание · дата) + операции
  открыть(клик)/переименовать/удалить; открытие = активный проект; hash-навигация
  `#p/<id>` (переживает перезагрузку); карточка-оболочка под блоки T6–T8.
- T6 карточка: блок «Оценка v0» (read-only из computeScore) + «Документы»
  (скачать ответы .json и метапромт .md).
- T7 карточка: «Оценка v1» (ручной ввод 1–5, тот же computeScore) + «Следующие
  шаги» (textarea) + «Решение» (4 опции); автосейв в store, без перерисовки.
- T8 карточка: «Экспорт карточки .md» (buildCardMd — все блоки + метапромт) +
  видимые заглушки «Deep research» (ждёт T9) и «Синтез» (этап D). Порядок блоков:
  v0 · документы · deep research · синтез · v1 · шаги · решение.

- T9 рассылка Netlify в проект: блок «Deep research» карточки — URL бэкенда
  (localStorage), выбор моделей, «Разослать»→providerId в project.researches,
  «Проверить»→текст+источники; механизм A (проверка при заходе + автопроверка
  ~10 мин пока вкладка открыта + ручная кнопка; pollTimer сбрасывается при
  навигации). Render-путь в app.js НЕ тронут. Проверено в браузере (fetch мок).

ДАЛЬШЕ:
- **T10** — деплой Netlify + ключи (OpenAI, Parallel.ai) + боевой прогон.
  **Инструкция готова: `DEPLOY-NETLIFY.md`.** Действие за пользователем: подключить
  репо к Netlify (functions-only, base=корень, functions=netlify/functions),
  вписать `PARALLEL_API_KEY`/`OPENAI_API_KEY`, проверить `<url>/api/start` (GET),
  вписать URL в блок «Deep research» на сайте, прогнать один реальный проект.

ТАКЖЕ СДЕЛАНО:
- T11 «Новый проект» как явное действие (оценка ≠ перезапись): `store.startNew()`
  (+isBlank, тесты), на Скоринге кнопка «Сбросить»→«Новый проект» (создаёт/переиспользует
  пустой проект, прошлый не трогает), на «Результате» строка-ссылка «Сохранено в проект…
  → открыть карточку», «Новый проект» в Проектах ведёт сразу в Скоринг. npm test 22/22.
- Боевой Netlify: ключи под кастомными именами OPENAI_API_MTS_KEY / PARALLEL_API_MTS_KEY
  (код читает их с fallback на …_KEY); OPENAI_MODEL, PARALLEL_PROCESSOR, OPENAI_EFFORT.
  gpt-5 → авто reasoning.effort=high + web_search; deep-research модели → web_search_preview.
  РФ-ограничение: o3/o4-mini-deep-research требуют верификации OpenAI (недоступно) →
  используем gpt-5.1 (high) + Parallel как движок глубины. Инструкция — DEPLOY-NETLIFY.md.

- T12 синтез + PDF: `frontend/report.js` (buildSynthesisPrompt, mdToHtml — чистые,
  тесты в tests/report.test.mjs); блок «Интегрированный синтез» в карточке —
  «Собрать синтез» сводит готовые отчёты в один (gpt-5.1) через /api/start+check
  (project.synthesis, механизм A), рендер mdToHtml; кнопка «Скачать PDF» — вся
  карточка (описание, v0, синтез, отчёты, v1, шаги, решение) печатным видом
  (buildCardHtml + PRINT_CSS, window.print → Сохранить как PDF). npm test 28/28.

- T13 авто-v1 из синтеза: синтез-промт требует строку «БАЛЛЫ: A=N..E=N»;
  `parseScores` (report.js, тесты) вытаскивает 1–5; при готовом синтезе один раз
  (флаг synthesis.scored) заполняются ТОЛЬКО пустые слоты scores.v1 (ручные не
  затираются), карточка ререндерится, в блоке v1 заметка. npm test 32/32.

- T14 список проектов: `report.projectTotals` (чистая, тесты) — строка показывает
  итог v0, итог v1 и цветной бейдж решения.

- T15 жизненный цикл внутри проекта: модель `promptEdited`; `report.resolvePrompt`
  (единый источник «актуальный метапромт») и `report.answersToRows` (+тесты). Опросник
  снапшотит метапромт только если его не правили. В карточке: раскрываемые «Ответы (V0)»
  + кнопка «Заполнить/редактировать опросник»; раскрываемый РЕДАКТИРУЕМЫЙ метапромт
  (project.prompt, «Пересобрать из ответов», «Скачать .md»). Диприсёрч/синтез/PDF/.md
  берут текст через resolvePrompt → диприсёрч использует правленый текст проекта.
  Вкладка «Скоринг» убрана из меню (опросник открывается из проекта; scoring.html жив).
  npm test 36/36.

ПОЗЖЕ (этап D): общее хранилище
(Netlify Blobs); прикрепление файлов; опц. провайдер OpenRouter (доступ к o3/Claude/Gemini
без верификации OpenAI, RU-дружелюбная оплата).

## Решения пользователя (зафиксированы)
- Рассылка: ChatGPT + **Parallel.ai** (НЕ Perplexity). Хостинг бэкенда рассылки —
  **Netlify** (у пользователя платный тариф), механизм проверки = **A (из браузера)**.
- Хранилище реестра — localStorage сейчас, общее (Netlify Blobs) — позже.
- v1 — руками сейчас, авто из синтеза — позже.
- Тип1/Тип2 убраны полностью (актуальная методология — «Финальные версии 2», единый
  денежный трек, 5 факторов 25/25/20/20/10, фактор «Защищаемость»).
