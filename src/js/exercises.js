/* ============================================================
 * exercises.js — встроенная библиотека упражнений
 * Контракт: EXERCISE_LIBRARY: Exercise[]
 * Exercise: { id, name, primaryMuscle, secondaryMuscles, kind, weightStep,
 *             muscles }
 * primaryMuscle: chest|back|legs|shoulders|arms|core
 * kind: compound|isolation
 * weightStep: минимальный шаг изменения веса, кг
 * muscles: { детальнаяМышца: доля } — вклад сета в каждую мышцу
 *   (методика «дробных сетов» RP: целевая 1.0, синергист 0.5,
 *   второстепенная 0.25). Используется в аналитике нагрузки.
 * ============================================================ */

const MUSCLE_LABELS = {
  chest: 'Грудь', back: 'Спина', legs: 'Ноги',
  shoulders: 'Плечи', arms: 'Руки', core: 'Кор',
};

/* Детальные мышцы/пучки. group — крупная группа из MUSCLE_LABELS. */
const DETAIL_MUSCLES = {
  chest_upper: { label: 'Верх груди',        group: 'chest' },
  chest_mid:   { label: 'Середина груди',    group: 'chest' },
  chest_lower: { label: 'Низ груди',         group: 'chest' },
  lats:        { label: 'Широчайшие',        group: 'back' },
  traps:       { label: 'Трапеции/верх спины', group: 'back' },
  lower_back:  { label: 'Разгибатели/поясница', group: 'back' },
  front_delt:  { label: 'Передняя дельта',   group: 'shoulders' },
  side_delt:   { label: 'Средняя дельта',    group: 'shoulders' },
  rear_delt:   { label: 'Задняя дельта',     group: 'shoulders' },
  biceps:      { label: 'Бицепс',            group: 'arms' },
  triceps:     { label: 'Трицепс',           group: 'arms' },
  forearms:    { label: 'Предплечья',        group: 'arms' },
  quads:       { label: 'Квадрицепс',        group: 'legs' },
  hamstrings:  { label: 'Бицепс бедра',      group: 'legs' },
  glutes:      { label: 'Ягодичные',         group: 'legs' },
  adductors:   { label: 'Приводящие',        group: 'legs' },
  calves:      { label: 'Икры',              group: 'legs' },
  abs:         { label: 'Пресс',             group: 'core' },
  obliques:    { label: 'Косые живота',      group: 'core' },
};

const EXERCISE_LIBRARY = [
  // ---- Грудь ----
  { id: 'bb-bench-press',      name: 'Жим штанги лёжа',                primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2.5, muscles: { chest_mid: 1, chest_lower: 0.25, front_delt: 0.5, triceps: 0.5 } },
  { id: 'db-bench-press',      name: 'Жим гантелей лёжа',              primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2, muscles: { chest_mid: 1, chest_lower: 0.25, front_delt: 0.5, triceps: 0.5 } },
  { id: 'incline-bb-press',    name: 'Жим штанги на наклонной',        primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2.5, muscles: { chest_upper: 1, chest_mid: 0.25, front_delt: 0.5, triceps: 0.5 } },
  { id: 'incline-db-press',    name: 'Жим гантелей на наклонной',      primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 2, muscles: { chest_upper: 1, chest_mid: 0.25, front_delt: 0.5, triceps: 0.5 } },
  { id: 'machine-chest-press', name: 'Жим в тренажёре на грудь',       primaryMuscle: 'chest', secondaryMuscles: ['shoulders', 'arms'], kind: 'compound',  weightStep: 5, muscles: { chest_mid: 1, chest_lower: 0.25, front_delt: 0.5, triceps: 0.5 } },
  { id: 'dips',                name: 'Отжимания на брусьях',           primaryMuscle: 'chest', secondaryMuscles: ['arms', 'shoulders'], kind: 'compound',  weightStep: 2.5, bodyweight: true, muscles: { chest_lower: 1, chest_mid: 0.5, triceps: 0.5, front_delt: 0.25 } },
  { id: 'cable-fly',           name: 'Сведение в кроссовере',          primaryMuscle: 'chest', secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { chest_mid: 1, chest_lower: 0.25, front_delt: 0.25 } },
  { id: 'db-fly',              name: 'Разводка гантелей лёжа',         primaryMuscle: 'chest', secondaryMuscles: [],                     kind: 'isolation', weightStep: 2, muscles: { chest_mid: 1, front_delt: 0.25 } },
  { id: 'pec-deck',            name: 'Бабочка (пек-дек)',              primaryMuscle: 'chest', secondaryMuscles: [],                     kind: 'isolation', weightStep: 5, muscles: { chest_mid: 1, front_delt: 0.25 } },

  // ---- Спина ----
  { id: 'db-shrug',            name: 'Шраги с гантелями',              primaryMuscle: 'back',  secondaryMuscles: ['shoulders'],         kind: 'isolation', weightStep: 2, muscles: { traps: 1, forearms: 0.25 } },
  { id: 'deadlift',            name: 'Становая тяга',                  primaryMuscle: 'back',  secondaryMuscles: ['legs', 'core'],      kind: 'compound',  weightStep: 2.5, muscles: { lower_back: 1, glutes: 0.5, hamstrings: 0.5, traps: 0.5, quads: 0.25, forearms: 0.25, abs: 0.25 } },
  { id: 'pull-up',             name: 'Подтягивания',                   primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 2.5, bodyweight: true, muscles: { lats: 1, biceps: 0.5, traps: 0.25, rear_delt: 0.25, forearms: 0.25 } },
  { id: 'lat-pulldown',        name: 'Тяга верхнего блока',            primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 5, muscles: { lats: 1, biceps: 0.5, traps: 0.25, rear_delt: 0.25 } },
  { id: 'bb-row',              name: 'Тяга штанги в наклоне',          primaryMuscle: 'back',  secondaryMuscles: ['arms', 'core'],      kind: 'compound',  weightStep: 2.5, muscles: { lats: 1, traps: 0.5, rear_delt: 0.5, biceps: 0.5, lower_back: 0.25, forearms: 0.25 } },
  { id: 'db-row',              name: 'Тяга гантели в наклоне',         primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 2, muscles: { lats: 1, traps: 0.5, rear_delt: 0.5, biceps: 0.5 } },
  { id: 'seated-cable-row',    name: 'Тяга горизонтального блока',     primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 5, muscles: { lats: 1, traps: 0.5, rear_delt: 0.25, biceps: 0.5 } },
  { id: 't-bar-row',           name: 'Тяга Т-грифа',                   primaryMuscle: 'back',  secondaryMuscles: ['arms', 'core'],      kind: 'compound',  weightStep: 2.5, muscles: { lats: 1, traps: 0.5, rear_delt: 0.25, biceps: 0.5, lower_back: 0.25 } },
  { id: 'straight-arm-pd',     name: 'Пуловер на блоке',               primaryMuscle: 'back',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { lats: 1, triceps: 0.25, chest_lower: 0.25 } },
  { id: 'hyperextension',      name: 'Гиперэкстензия',                 primaryMuscle: 'back',  secondaryMuscles: ['legs', 'core'],      kind: 'isolation', weightStep: 2.5, muscles: { lower_back: 1, glutes: 0.5, hamstrings: 0.5 } },

  // ---- Ноги ----
  { id: 'bb-squat',            name: 'Приседания со штангой',          primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2.5, muscles: { quads: 1, glutes: 0.5, adductors: 0.5, lower_back: 0.25, abs: 0.25 } },
  { id: 'front-squat',         name: 'Фронтальные приседания',         primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2.5, muscles: { quads: 1, glutes: 0.5, abs: 0.25, traps: 0.25 } },
  { id: 'leg-press',           name: 'Жим ногами',                     primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'compound',  weightStep: 5, muscles: { quads: 1, glutes: 0.5, adductors: 0.25 } },
  { id: 'romanian-dl',         name: 'Румынская тяга',                 primaryMuscle: 'legs',  secondaryMuscles: ['back', 'core'],      kind: 'compound',  weightStep: 2.5, muscles: { hamstrings: 1, glutes: 0.5, lower_back: 0.5, forearms: 0.25 } },
  { id: 'bulgarian-split',     name: 'Болгарские выпады',              primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2, muscles: { quads: 1, glutes: 0.5, adductors: 0.25 } },
  { id: 'walking-lunge',       name: 'Выпады с гантелями',             primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 2, muscles: { quads: 1, glutes: 0.5, hamstrings: 0.25 } },
  { id: 'leg-extension',       name: 'Разгибание ног в тренажёре',     primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5, muscles: { quads: 1 } },
  { id: 'leg-curl',            name: 'Сгибание ног в тренажёре',       primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5, muscles: { hamstrings: 1, calves: 0.25 } },
  { id: 'calf-raise',          name: 'Подъёмы на носки стоя',          primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5, muscles: { calves: 1 } },
  { id: 'hip-thrust',          name: 'Ягодичный мост со штангой',      primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'compound',  weightStep: 5, muscles: { glutes: 1, hamstrings: 0.5, quads: 0.25 } },

  // ---- Плечи ----
  { id: 'ohp',                 name: 'Жим штанги стоя (армейский)',    primaryMuscle: 'shoulders', secondaryMuscles: ['arms', 'core'],  kind: 'compound',  weightStep: 2.5, muscles: { front_delt: 1, side_delt: 0.5, triceps: 0.5, traps: 0.25, abs: 0.25 } },
  { id: 'db-shoulder-press',   name: 'Жим гантелей сидя',              primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],          kind: 'compound',  weightStep: 2, muscles: { front_delt: 1, side_delt: 0.5, triceps: 0.5 } },
  { id: 'lateral-raise',       name: 'Махи гантелями в стороны',       primaryMuscle: 'shoulders', secondaryMuscles: [],                 kind: 'isolation', weightStep: 1, muscles: { side_delt: 1, traps: 0.25 } },
  { id: 'cable-lateral',       name: 'Отведение в кроссовере',         primaryMuscle: 'shoulders', secondaryMuscles: [],                 kind: 'isolation', weightStep: 2.5, muscles: { side_delt: 1 } },
  { id: 'rear-delt-fly',       name: 'Разведения на заднюю дельту',    primaryMuscle: 'shoulders', secondaryMuscles: ['back'],          kind: 'isolation', weightStep: 1, muscles: { rear_delt: 1, traps: 0.25 } },
  { id: 'face-pull',           name: 'Тяга к лицу (фейс-пулл)',        primaryMuscle: 'shoulders', secondaryMuscles: ['back'],          kind: 'isolation', weightStep: 2.5, muscles: { rear_delt: 1, traps: 0.5, side_delt: 0.25 } },
  { id: 'upright-row',         name: 'Тяга штанги к подбородку',       primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],          kind: 'compound',  weightStep: 2.5, muscles: { side_delt: 1, traps: 0.5, front_delt: 0.25, biceps: 0.25 } },

  // ---- Руки ----
  { id: 'bb-curl',             name: 'Подъём штанги на бицепс',        primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { biceps: 1, forearms: 0.25 } },
  { id: 'db-curl',             name: 'Подъём гантелей на бицепс',      primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1, muscles: { biceps: 1, forearms: 0.25 } },
  { id: 'hammer-curl',         name: 'Молотки',                        primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1, muscles: { biceps: 1, forearms: 0.5 } },
  { id: 'preacher-curl',       name: 'Бицепс на скамье Скотта',        primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { biceps: 1 } },
  { id: 'cable-pushdown',      name: 'Разгибание на блоке (трицепс)',  primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { triceps: 1 } },
  { id: 'overhead-ext',        name: 'Французский жим из-за головы',   primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { triceps: 1 } },
  { id: 'skull-crusher',       name: 'Французский жим лёжа',           primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { triceps: 1 } },
  { id: 'close-grip-bench',    name: 'Жим узким хватом',               primaryMuscle: 'arms',  secondaryMuscles: ['chest', 'shoulders'], kind: 'compound', weightStep: 2.5, muscles: { triceps: 1, chest_mid: 0.5, front_delt: 0.5 } },

  // ---- Дополнение по исследованиям 2021–2026 ----
  // seated-leg-curl: Maeo 2021 — сгибания СИДЯ (бедро согнуто → хамстринг растянут) растят лучше, чем лёжа
  // hack-squat: глубокая амплитуда, квадрицепс в растяжении под нагрузкой
  // incline-db-curl / cable-curl-behind: плечо разогнуто → длинная головка бицепса растянута
  // chest-supported-row: высокий стимул при низкой системной усталости (без нагрузки на поясницу)
  { id: 'hack-squat',          name: 'Гакк-приседания',                primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'compound',  weightStep: 5, muscles: { quads: 1, glutes: 0.5, adductors: 0.25 } },
  { id: 'seated-leg-curl',     name: 'Сгибание ног сидя',              primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5, muscles: { hamstrings: 1 } },
  { id: 'adductor-machine',    name: 'Сведение ног в тренажёре',       primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5, muscles: { adductors: 1 } },
  { id: 'abductor-machine',    name: 'Разведение ног в тренажёре',     primaryMuscle: 'legs',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 5, muscles: { glutes: 1 } },
  { id: 'cable-kickback',      name: 'Отведение ноги в кроссовере',    primaryMuscle: 'legs',  secondaryMuscles: ['core'],              kind: 'isolation', weightStep: 2.5, muscles: { glutes: 1, hamstrings: 0.25 } },
  { id: 'chest-supported-row', name: 'Тяга в упоре грудью',            primaryMuscle: 'back',  secondaryMuscles: ['arms'],              kind: 'compound',  weightStep: 2.5, muscles: { lats: 1, traps: 0.5, rear_delt: 0.5, biceps: 0.5 } },
  { id: 'db-pullover',         name: 'Пуловер с гантелью',             primaryMuscle: 'chest', secondaryMuscles: ['back'],              kind: 'isolation', weightStep: 2, muscles: { chest_mid: 1, lats: 0.5, triceps: 0.25 } },
  { id: 'machine-shoulder-press', name: 'Жим в тренажёре на плечи',    primaryMuscle: 'shoulders', secondaryMuscles: ['arms'],          kind: 'compound',  weightStep: 5, muscles: { front_delt: 1, side_delt: 0.5, triceps: 0.5 } },
  { id: 'incline-db-curl',     name: 'Бицепс на наклонной скамье',     primaryMuscle: 'arms',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1, muscles: { biceps: 1 } },
  { id: 'cable-curl-behind',   name: 'Бицепс в кроссовере из-за спины', primaryMuscle: 'arms', secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { biceps: 1 } },

  // ---- Кор ----
  { id: 'plank',               name: 'Планка (с отягощением)',         primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { abs: 1, obliques: 0.25 } },
  { id: 'cable-crunch',        name: 'Скручивания на блоке',           primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 2.5, muscles: { abs: 1 } },
  { id: 'hanging-leg-raise',   name: 'Подъём ног в висе',              primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1, bodyweight: true, muscles: { abs: 1, obliques: 0.25, forearms: 0.25 } },
  { id: 'ab-wheel',            name: 'Ролик для пресса',               primaryMuscle: 'core',  secondaryMuscles: ['shoulders'],         kind: 'compound',  weightStep: 1, bodyweight: true, muscles: { abs: 1, obliques: 0.25, lats: 0.25 } },
  { id: 'russian-twist',       name: 'Русские скручивания',            primaryMuscle: 'core',  secondaryMuscles: [],                     kind: 'isolation', weightStep: 1, muscles: { obliques: 1, abs: 0.5 } },
  { id: 'farmer-walk',         name: 'Прогулка фермера',               primaryMuscle: 'core',  secondaryMuscles: ['back', 'arms'],      kind: 'compound',  weightStep: 2, muscles: { forearms: 1, traps: 0.5, abs: 0.5, obliques: 0.25 } },
];

function getExercise(state, id) {
  return state.exercises.find((e) => e.id === id) || null;
}

/** Детальные мышцы одной крупной группы. */
function detailsOfGroup(group) {
  return Object.keys(DETAIL_MUSCLES).filter((m) => DETAIL_MUSCLES[m].group === group);
}

/** Доли нагрузки упражнения по детальным мышцам.
 *  Без карты muscles (старые пользовательские) — фолбэк: 1.0 размазывается
 *  по детальным мышцам primaryMuscle, по 0.5 — на каждую secondary-группу.
 *  Суммы на уровне групп совпадают с явной картой. */
function muscleFractions(exercise) {
  if (!exercise) return {};
  if (exercise.muscles && typeof exercise.muscles === 'object') return exercise.muscles;
  const out = {};
  const spread = (group, share) => {
    const ids = detailsOfGroup(group);
    for (const id of ids) out[id] = +((out[id] || 0) + share / ids.length).toFixed(4);
  };
  if (exercise.primaryMuscle) spread(exercise.primaryMuscle, 1);
  for (const g of exercise.secondaryMuscles || []) spread(g, 0.5);
  return out;
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
  module.exports = { EXERCISE_LIBRARY, MUSCLE_LABELS, DETAIL_MUSCLES, detailsOfGroup, muscleFractions, getExercise, searchExercises, videoUrl };
}
