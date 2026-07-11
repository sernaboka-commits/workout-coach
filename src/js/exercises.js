/* ============================================================
 * exercises.js — встроенная библиотека упражнений
 * Контракт: EXERCISE_LIBRARY: Exercise[]
 * Exercise: { id, name, primaryMuscle, secondaryMuscles, kind, weightStep }
 * primaryMuscle: chest|back|legs|shoulders|arms|core
 * kind: compound|isolation
 * weightStep: минимальный шаг изменения веса, кг
 * ============================================================ */

const MUSCLE_LABELS = {
  chest: 'Грудь', back: 'Спина', legs: 'Ноги',
  shoulders: 'Плечи', arms: 'Руки', core: 'Кор',
};

const EXERCISE_LIBRARY = [
  // ---- Грудь ----
  { id: 'bb-bench-press',      name: 'Жим штанги лёжа',                primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2.5 },
  { id: 'db-bench-press',      name: 'Жим гантелей лёжа',              primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2 },
  { id: 'incline-bb-press',    name: 'Жим штанги на наклонной',        primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2.5 },
  { id: 'incline-db-press',    name: 'Жим гантелей на наклонной',      primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2 },
  { id: 'machine-chest-press', name: 'Жим в тренажёре на грудь',       primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 5 },
  { id: 'dips',                name: 'Отжимания на брусьях',           primaryMuscle: 'chest', secondaryMuscles: ['arms', 'shoulders'], kind: 'compound',  weightStep: 2.5 },
  { id: 'cable-fly',           name: 'Сведение в кроссовере',          primaryMuscle: 'chest', secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'db-fly',              name: 'Разводка гантелей лёжа',         primaryMuscle: 'chest', secondaryMuscles: [],                     kind: 'isolation', weightStep: 2 },
  { id: 'pec-deck',            name: 'Бабочка (пек-дек)',              primaryMuscle: 'chest', secondaryMuscles: [],                     kind: 'isolation', weightStep: 5 },

  // ---- Спина ----
  { id: 'db-shrug',            name: 'Шраги с гантелями',              primaryMuscle: 'back',  secondaryMuscles: ['shoulders'],         kind: 'isolation', weightStep: 2 },
  { id: 'deadlift',            name: 'Становая тяга',                  primaryMuscle: 'back',  secondaryMuscles: ['legs', 'core'],      kind: 'compound',  weightStep: 2.5 },
  { id: 'pull-up',             name: 'Подтягивания',                   primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 2.5 },
  { id: 'lat-pulldown',        name: 'Тяга верхнего блока',            primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 5 },
  { id: 'bb-row',              name: 'Тяга штанги в наклоне',          primaryMuscle: 'back',  secondaryMuscles: ['arms', 'core'],      kind: 'compound',  weightStep: 2.5 },
  { id: 'db-row',              name: 'Тяга гантели в наклоне',         primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 2 },
  { id: 'seated-cable-row',    name: 'Тяга горизонтального блока',     primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 5 },
  { id: 't-bar-row',           name: 'Тяга Т-грифа',                   primaryMuscle: 'back',  secondaryMuscles: ['arms', 'core'],      kind: 'compound',  weightStep: 2.5 },
  { id: 'straight-arm-pd',     name: 'Пуловер на блоке',               primaryMuscle: 'back',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'hyperextension',      name: 'Гиперэкстензия',                 primaryMuscle: 'back',  secondaryMuscles: ['legs', 'core'],      kind: 'isolation', weightStep: 2.5 },

  // ---- Ноги ----
  { id: 'bb-squat',            name: 'Приседания со штангой',          primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2.5 },
  { id: 'front-squat',         name: 'Фронтальные приседания',         primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2.5 },
  { id: 'leg-press',           name: 'Жим ногами',                     primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'compound',  weightStep: 5 },
  { id: 'romanian-dl',         name: 'Румынская тяга',                 primaryMuscle: 'legs',  secondaryMuscles: ['back', 'core'],      kind: 'compound',  weightStep: 2.5 },
  { id: 'bulgarian-split',     name: 'Болгарские выпады',              primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2 },
  { id: 'walking-lunge',       name: 'Выпады с гантелями',             primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2 },
  { id: 'leg-extension',       name: 'Разгибание ног в тренажёре',     primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5 },
  { id: 'leg-curl',            name: 'Сгибание ног в тренажёре',       primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5 },
  { id: 'calf-raise',          name: 'Подъёмы на носки стоя',          primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5 },
  { id: 'hip-thrust',          name: 'Ягодичный мост со штангой',      primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 5 },

  // ---- Плечи ----
  { id: 'ohp',                 name: 'Жим штанги стоя (армейский)',    primaryMuscle: 'shoulders', secondaryMuscles: ['arms', 'core'],  kind: 'compound',  weightStep: 2.5 },
  { id: 'db-shoulder-press',   name: 'Жим гантелей сидя',              primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],          kind: 'compound',  weightStep: 2 },
  { id: 'lateral-raise',       name: 'Махи гантелями в стороны',       primaryMuscle: 'shoulders', secondaryMuscles: [],                 kind: 'isolation', weightStep: 1 },
  { id: 'cable-lateral',       name: 'Отведение в кроссовере',         primaryMuscle: 'shoulders', secondaryMuscles: [],                 kind: 'isolation', weightStep: 2.5 },
  { id: 'rear-delt-fly',       name: 'Разведения на заднюю дельту',    primaryMuscle: 'shoulders', secondaryMuscles: ['back'],          kind: 'isolation', weightStep: 1 },
  { id: 'face-pull',           name: 'Тяга к лицу (фейс-пулл)',        primaryMuscle: 'shoulders', secondaryMuscles: ['back'],          kind: 'isolation', weightStep: 2.5 },
  { id: 'upright-row',         name: 'Тяга штанги к подбородку',       primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],          kind: 'compound',  weightStep: 2.5 },

  // ---- Руки ----
  { id: 'bb-curl',             name: 'Подъём штанги на бицепс',        primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'db-curl',             name: 'Подъём гантелей на бицепс',      primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1 },
  { id: 'hammer-curl',         name: 'Молотки',                        primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1 },
  { id: 'preacher-curl',       name: 'Бицепс на скамье Скотта',        primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'cable-pushdown',      name: 'Разгибание на блоке (трицепс)',  primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'overhead-ext',        name: 'Французский жим из-за головы',   primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'skull-crusher',       name: 'Французский жим лёжа',           primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'close-grip-bench',    name: 'Жим узким хватом',               primaryMuscle: 'arms',  secondaryMuscles: ['chest', 'shoulders'], kind: 'compound', weightStep: 2.5 },

  // ---- Дополнение по исследованиям 2021–2026 ----
  // seated-leg-curl: Maeo 2021 — сгибания СИДЯ (бедро согнуто → хамстринг растянут) растят лучше, чем лёжа
  // hack-squat: глубокая амплитуда, квадрицепс в растяжении под нагрузкой
  // incline-db-curl / cable-curl-behind: плечо разогнуто → длинная головка бицепса растянута
  // chest-supported-row: высокий стимул при низкой системной усталости (без нагрузки на поясницу)
  { id: 'hack-squat',          name: 'Гакк-приседания',                primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'compound',  weightStep: 5 },
  { id: 'seated-leg-curl',     name: 'Сгибание ног сидя',              primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5 },
  { id: 'adductor-machine',    name: 'Сведение ног в тренажёре',       primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5 },
  { id: 'abductor-machine',    name: 'Разведение ног в тренажёре',     primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5 },
  { id: 'cable-kickback',      name: 'Отведение ноги в кроссовере',    primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'isolation', weightStep: 2.5 },
  { id: 'chest-supported-row', name: 'Тяга в упоре грудью',            primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 2.5 },
  { id: 'db-pullover',         name: 'Пуловер с гантелью',             primaryMuscle: 'chest', secondaryMuscles: ['back'],              kind: 'isolation', weightStep: 2 },
  { id: 'machine-shoulder-press', name: 'Жим в тренажёре на плечи',    primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],          kind: 'compound',  weightStep: 5 },
  { id: 'incline-db-curl',     name: 'Бицепс на наклонной скамье',     primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1 },
  { id: 'cable-curl-behind',   name: 'Бицепс в кроссовере из-за спины', primaryMuscle: 'arms', secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },

  // ---- Кор ----
  { id: 'plank',               name: 'Планка (с отягощением)',         primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'cable-crunch',        name: 'Скручивания на блоке',           primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5 },
  { id: 'hanging-leg-raise',   name: 'Подъём ног в висе',              primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1 },
  { id: 'ab-wheel',            name: 'Ролик для пресса',               primaryMuscle: 'core',  secondaryMuscles: ['shoulders'],         kind: 'compound',  weightStep: 1 },
  { id: 'russian-twist',       name: 'Русские скручивания',            primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1 },
  { id: 'farmer-walk',         name: 'Прогулка фермера',               primaryMuscle: 'core',  secondaryMuscles: ['back', 'arms'],      kind: 'compound',  weightStep: 2 },
];

function getExercise(state, id) {
  return state.exercises.find((e) => e.id === id) || null;
}

/** Ссылка на видео техники: поле video упражнения или YouTube-поиск по названию.
 *  Поиск не протухает (в отличие от ссылок на конкретные ролики) и работает
 *  для пользовательских упражнений. */
function videoUrl(exercise) {
  if (!exercise) return null;
  if (exercise.video) return exercise.video;
  return 'https://www.youtube.com/results?search_query=' +
    encodeURIComponent(exercise.name + ' техника выполнения');
}

function searchExercises(state, { query = '', muscle = null } = {}) {
  const q = query.trim().toLowerCase();
  return state.exercises.filter((e) => {
    if (muscle && e.primaryMuscle !== muscle) return false;
    if (q && !e.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

/* export для node-тестов; в браузере — глобальные объявления */
if (typeof module !== 'undefined') {
  module.exports = { EXERCISE_LIBRARY, MUSCLE_LABELS, getExercise, searchExercises, videoUrl };
}
