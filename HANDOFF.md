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

ДАЛЬШЕ (по плану, не начато):
- **T6** — карточка: блоки v0 + документы (скачать ответы .json и метапромт .md).
- **T7** — карточка: v1 (ручной ввод баллов, reuse computeScore) + следующие шаги + решение (Делаем/Валидируем/Спинофф/Не делаем) + автосейв.
- **T8** — экспорт всей карточки одним .md + блоки-заглушки «Deep research» и «Синтез».
- **T9** — рассылка Netlify в проект (переключатель режима, НЕ ломая Render-путь):
  «Разослать» → providerId в project.researches; механизм A — автопроверка ~10 мин
  пока вкладка открыта + проверка при заходе + кнопка «Проверить». Бэкенд `netlify/` готов (мок-тест зелёный).
- **T10** — деплой Netlify + ключи (OpenAI, Parallel.ai) + боевой прогон. Зависит от пользователя.

ПОЗЖЕ (этап D): синтез researches→один отчёт; авто-v1 из синтеза; общее хранилище
(Netlify Blobs); прикрепление файлов.

## Решения пользователя (зафиксированы)
- Рассылка: ChatGPT + **Parallel.ai** (НЕ Perplexity). Хостинг бэкенда рассылки —
  **Netlify** (у пользователя платный тариф), механизм проверки = **A (из браузера)**.
- Хранилище реестра — localStorage сейчас, общее (Netlify Blobs) — позже.
- v1 — руками сейчас, авто из синтеза — позже.
- Тип1/Тип2 убраны полностью (актуальная методология — «Финальные версии 2», единый
  денежный трек, 5 факторов 25/25/20/20/10, фактор «Защищаемость»).
