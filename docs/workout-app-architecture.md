# Архитектура: «Встроенный тренер» v1 (MVP)

**Стек (constraint из PRD):** Vanilla JS (ES2020+) + HTML + CSS, без фреймворков и внешних зависимостей. Хранение — localStorage. Артефакт — **один HTML-файл**, работает офлайн, открывается в любом браузере.

Чтобы совместить «один файл» с поддерживаемым кодом: исходники живут в модулях, тривиальный скрипт склейки (20 строк Node, только конкатенация — не сборка/бандлер) производит `dist/index.html`. Запуску пользователем сборка не нужна.

## 1. Структура папок

```
workout-coach/
├── src/
│   ├── index.html          # каркас: разметка экранов + точки монтирования
│   ├── css/
│   │   └── app.css         # вся тема (dark, mobile-first), одна таблица стилей
│   ├── js/
│   │   ├── store.js        # слой хранения: state, load/save, бэкап, миграции
│   │   ├── engine.js       # движок: прогрессия, RIR-коррекция, калибровка, мезоцикл
│   │   ├── analytics.js    # чистые функции: e1RM, объём по группам, стагнация
│   │   ├── exercises.js    # встроенная библиотека ~50 упражнений (константа)
│   │   ├── ui-workout.js   # экран активной тренировки + таймер отдыха
│   │   ├── ui-program.js   # конструктор дней A/B/C и библиотека упражнений
│   │   ├── ui-analytics.js # экран аналитики: графики (canvas), история
│   │   └── app.js          # роутер экранов, инициализация, глобальные события
│   └── build.js            # склейка src → dist/index.html (инлайн CSS/JS)
└── dist/
    └── index.html          # единственный артефакт — то, что открывает пользователь
```

## 2. Назначение файлов (по строке)

| Файл | Назначение |
|---|---|
| `index.html` | Разметка всех экранов (workout / program / analytics / settings), скрываемых через классы |
| `app.css` | Тёмная тема, крупные тач-элементы, стили степперов и таймера |
| `store.js` | Единственная точка чтения/записи localStorage; экспорт/импорт JSON-бэкапа; версия схемы + миграции |
| `engine.js` | `recommend()` — рекомендация на подход; логика двойной прогрессии, RIR-сигналов, калибровки, делоуда |
| `analytics.js` | Расчёт e1RM (Эпли), недельных сетов по группам, детектор стагнации — чистые функции без DOM |
| `exercises.js` | Массив упражнений: id, название, группы мышц, тип, шаг веса по умолчанию |
| `ui-workout.js` | Рендер тренировки: карточка подхода (рекомендация + прошлый результат), ввод, таймер, звук/вибрация |
| `ui-program.js` | CRUD дней A/B/C, выбор из библиотеки (поиск/фильтр), параметры упражнения в дне |
| `ui-analytics.js` | Графики e1RM и объёма на `<canvas>`, бейджи стагнации, лента истории с редактированием |
| `app.js` | Нижняя навигация, старт приложения, напоминание о бэкапе |
| `build.js` | `node build.js` → инлайнит CSS и JS в один `dist/index.html` |

## 3. Data model

Всё состояние — один объект в localStorage под ключом `workoutCoach.v1`.

```javascript
AppState = {
  schemaVersion: 1,
  settings: { weightStepDefault: 2.5, backupReminderDays: 14, lastBackupAt: ISO | null },

  exercises: [ Exercise ],          // библиотека (встроенная + пользовательские)
  program:   { days: [ DayTemplate ] },   // A/B/C
  sessions:  [ Session ],           // история тренировок
  mesocycle: { cycleNo: 1, weekNo: 1, startedAt: ISO, deloadShift: 0 }
}

Exercise = {
  id, name,
  primaryMuscle: "chest|back|legs|shoulders|arms|core",
  secondaryMuscles: [ ... ],
  kind: "compound|isolation",
  weightStep: 2.5,
  isCustom: false
}

DayTemplate = {                     // день A/B/C
  id, label: "A",
  items: [{
    exerciseId,
    repRangeMin: 8, repRangeMax: 12,
    workSets: 3,
    targetRIR: 2,                   // база; фактическая цель модулируется неделей мезоцикла
    restSec: 150
  }]
}

Session = {
  id, date: ISO, dayId,
  weekNo, isDeload: false,
  sets: [ SetLog ],
  note: string | null
}

SetLog = {
  id, exerciseId, setNo,
  weight, reps, rir,
  isCalibration: false,             // калибровочные точки исключаются из стагнации
  analysis: null,                   // ЗАДЕЛ v2: метрики/флаги видеоанализа
  mediaRef: null                    // ЗАДЕЛ v2: ссылка на видео подхода
}
```

## 4. Внутренний API (endpoints)

Бэкенда нет (constraint: офлайн, один файл) — роль API-контракта играют публичные функции модулей. UI-слой вызывает только их, напрямую в state не лезет.

**store.js**

| Функция | Аналог endpoint | Что делает |
|---|---|---|
| `load()` | GET /state | Читает и валидирует состояние, применяет миграции |
| `save(state)` | PUT /state | Атомарная запись в localStorage |
| `exportBackup()` | GET /backup | Сериализует состояние → скачивание JSON-файла |
| `importBackup(file)` | POST /backup | Валидация схемы, замена состояния |
| `logSet(sessionId, setLog)` | POST /sessions/:id/sets | Добавляет подход, триггерит save |
| `updateSet(setId, patch)` | PATCH /sets/:id | Правка прошлых записей из истории |

**engine.js**

| Функция | Аналог endpoint | Что делает |
|---|---|---|
| `recommend(exerciseId, setNo, ctx)` | GET /recommendation | → `{ weight, reps, targetRIR, reason }`; учитывает историю, потолок повторов, RIR-сигналы, неделю мезоцикла/делоуд |
| `calibrate(exerciseId, probeSet)` | POST /calibration | Проекция рабочего веса по Эпли из разведочного подхода → `{ weight, confidence }` |
| `mesoStatus(state)` | GET /mesocycle | Текущая неделя, целевой RIR недели, флаг делоуда |
| `advanceWeek(state)` / `shiftDeload(±1)` | POST /mesocycle/advance | Переход недели; ручной сдвиг делоуда (риск из PRD) |

**analytics.js**

| Функция | Аналог endpoint | Что делает |
|---|---|---|
| `e1rmSeries(exerciseId)` | GET /analytics/e1rm | Ряд «дата → e1RM» (лучший сет сессии), калибровки маркируются |
| `weeklyVolume(weekOffset)` | GET /analytics/volume | Сеты по мышечным группам за неделю + флаг вне коридора 10–20 |
| `stagnation()` | GET /analytics/stagnation | Упражнения без роста e1RM 3+ недели (вне делоуда) + подсказка-гипотеза |

## Принципы (минимализм осознанный)

1. **Никакого фреймворка**: экранов четыре, состояние одно — vanilla JS дешевле React по весу и сложности при этом масштабе.
2. **engine и analytics — чистые функции** без DOM: тестируются в консоли, и это тот самый «интерфейс сигналов», куда в v2 подключится видеоанализ.
3. **Одна точка записи** (store.save) — защита целостности данных, главного риска PRD.
4. Графики — голый `<canvas>` (2 типа графиков не оправдывают chart-библиотеку).
