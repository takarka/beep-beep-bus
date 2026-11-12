/**
 * Tiny i18n: English is the source of keys, other languages are type-checked
 * against it, so a missing translation is a compile error.
 */
const en = {
  title: 'Beep-Beep Bus',
  langName: 'English',
  langBadge: 'ENG',
  play: 'Play',
  drive: 'Drive',
  factory: 'Bus Factory',
  step_body: 'Body',
  step_doors: 'Doors',
  step_wheels: 'Wheels',
  step_color: 'Colour',
  step_lights: 'Headlights',
  step_decor: 'Stickers',
  step_number: 'Number',
  busReady: 'Your bus is ready!',
  go: "Let's go!",
  busStop: 'Bus stop!',
  stopHere: 'Stop here!',
  redStop: 'Red light — stop!',
  greenGo: 'Green — go!',
  wellDone: 'Well done!',
  ranRed: 'That was a red light!',
  missedStop: 'We missed the stop!',
  level: 'Level',
  results: 'Route complete!',
  passengers: 'Passengers',
  mistakes: 'Mistakes',
  again: 'Again',
  next: 'Next',
  menu: 'Menu',
  paused: 'Pause',
  continue: 'Continue',
  rotate: 'Please turn your device sideways',
  holdGas: 'Hold the green pedal to drive',
  garage: 'Garage',
  assist: 'Helper',
  beep: 'Beep!',
  body_city: 'City',
  body_bendy: 'Bendy',
  body_double: 'Double-decker',
  body_school: 'School',
};

export type TextKey = keyof typeof en;
type Dict = Record<TextKey, string>;

const ru: Dict = {
  title: 'Бип-Бип Автобус',
  langName: 'Русский',
  langBadge: 'РУС',
  play: 'Играть',
  drive: 'В путь',
  factory: 'Автобусный завод',
  step_body: 'Кузов',
  step_doors: 'Двери',
  step_wheels: 'Колёса',
  step_color: 'Цвет',
  step_lights: 'Фары',
  step_decor: 'Наклейки',
  step_number: 'Номер',
  busReady: 'Твой автобус готов!',
  go: 'Поехали!',
  busStop: 'Остановка!',
  stopHere: 'Остановись здесь!',
  redStop: 'Красный — стой!',
  greenGo: 'Зелёный — едем!',
  wellDone: 'Молодец!',
  ranRed: 'Это был красный свет!',
  missedStop: 'Проехали остановку!',
  level: 'Уровень',
  results: 'Маршрут пройден!',
  passengers: 'Пассажиры',
  mistakes: 'Ошибки',
  again: 'Ещё раз',
  next: 'Дальше',
  menu: 'Меню',
  paused: 'Пауза',
  continue: 'Продолжить',
  rotate: 'Поверни устройство горизонтально',
  holdGas: 'Нажми зелёную педаль, чтобы ехать',
  garage: 'Гараж',
  assist: 'Помощник',
  beep: 'Бип!',
  body_city: 'Городской',
  body_bendy: 'Гармошка',
  body_double: 'Двухэтажный',
  body_school: 'Школьный',
};

const kk: Dict = {
  title: 'Бип-Бип Автобус',
  langName: 'Қазақша',
  langBadge: 'ҚАЗ',
  play: 'Ойнау',
  drive: 'Жолға',
  factory: 'Автобус зауыты',
  step_body: 'Шанақ',
  step_doors: 'Есіктер',
  step_wheels: 'Дөңгелектер',
  step_color: 'Түсі',
  step_lights: 'Шамдар',
  step_decor: 'Жапсырмалар',
  step_number: 'Нөмірі',
  busReady: 'Автобусың дайын!',
  go: 'Кеттік!',
  busStop: 'Аялдама!',
  stopHere: 'Осында тоқта!',
  redStop: 'Қызыл — тоқта!',
  greenGo: 'Жасыл — жүр!',
  wellDone: 'Жарайсың!',
  ranRed: 'Қызыл шамнан өтіп кеттік!',
  missedStop: 'Аялдамадан өтіп кеттік!',
  level: 'Деңгей',
  results: 'Маршрут аяқталды!',
  passengers: 'Жолаушылар',
  mistakes: 'Қателер',
  again: 'Қайтадан',
  next: 'Келесі',
  menu: 'Мәзір',
  paused: 'Үзіліс',
  continue: 'Жалғастыру',
  rotate: 'Құрылғыны көлденең бұр',
  holdGas: 'Жүру үшін жасыл педальды бас',
  garage: 'Гараж',
  assist: 'Көмекші',
  beep: 'Бип!',
  body_city: 'Қалалық',
  body_bendy: 'Гармонь',
  body_double: 'Екі қабатты',
  body_school: 'Мектеп',
};

export const LANGS = ['ru', 'kk', 'en'] as const;
export type Lang = (typeof LANGS)[number];

export const DICTS: Record<Lang, Dict> = { ru, kk, en };

let current: Lang = 'ru';

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = DICTS[lang].title;
    const rotate = document.getElementById('rotate-text');
    if (rotate) rotate.textContent = DICTS[lang].rotate;
  }
}

export const getLang = (): Lang => current;

export function t(key: TextKey): string {
  return DICTS[current][key];
}

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** Best guess from the browser; Russian is the default. */
export function detectLang(navLangs: readonly string[]): Lang {
  for (const l of navLangs) {
    const code = l.toLowerCase().slice(0, 2);
    if (code === 'kk' || code === 'kz') return 'kk';
    if (code === 'ru') return 'ru';
    if (code === 'en') return 'en';
  }
  return 'ru';
}
