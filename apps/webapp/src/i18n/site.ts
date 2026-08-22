import type { Lang } from './strings';

/**
 * Everything the site says that is not the planner.
 *
 * The chrome, the landing page and the tracker's page. Kept apart from
 * `strings.ts` — which is the planner's UI, and was here first — because the
 * two are edited for different reasons: one changes when the board changes,
 * this one changes when the pitch does. They share `Lang` and the storage key,
 * so a visitor picks a language once for the whole site.
 *
 * **Written for players, not for developers.** Whoever is reading this wants to
 * know whether the thing is worth their evening and whether it is safe to run,
 * not how it is put together — so nothing here names a framework, a file
 * format, an internal component, or a launch flag that does not exist any more.
 * Anyone who wants that is one click away on GitHub, where it belongs.
 *
 * Two words are used carefully. **Build** always means an item build, never a
 * downloadable one — a release is a *version* everywhere below. And the tracker
 * is described by what a player sees, so "the log" is a file Dota writes, never
 * a stream, a feed or a source.
 */

export interface SiteStrings {
  brand: string;
  skipToContent: string;
  theme: string;
  language: string;

  nav: {
    home: string;
    planner: string;
    tracker: string;
    source: string;
  };

  landing: {
    /** Not rendered on the page — it is the browser tab's title. */
    title: string;

    planner: {
      kicker: string;
      title: string;
      lead: string;
      features: string[];
      cta: string;
      note: string;
    };

    tracker: {
      kicker: string;
      title: string;
      lead: string;
      features: string[];
      cta: string;
      note: string;
    };
  };

  /** The tracker's own page. */
  tracker: {
    kicker: string;
    title: string;
    lead: string;

    windows: {
      title: string;
      lead: string;
      items: { name: string; text: string }[];
    };

    fitting: {
      title: string;
      lead: string;
      items: { name: string; text: string }[];
    };

    setup: {
      title: string;
      lead: string;
      steps: string[];
      note: string;
    };

    /** Where the gold figures come from, since the game reports none. */
    pricing: {
      title: string;
      text: string;
    };

    privacy: {
      title: string;
      text: string;
    };
  };

  /** Labels inside the two UI previews. */
  preview: {
    plannerCaption: string;
    trackerCaption: string;
    section: string;
    spells: string;
    potions: string;
    equipment: string;
    runes: string;
    neutral: string;
    backpack: string;
    at: string;
    inHideout: string;
    runs: string;
    run: string;
    goldPerHour: string;
    session: string;
    room: string;
    colItem: string;
    colValue: string;
    colTotal: string;
    hotkeyHint: string;
    collapsed: string;
    expanded: string;
  };

  download: {
    checking: string;
    label: string;
    version: (tag: string) => string;
    size: (mb: string) => string;
    published: (date: string) => string;
    allReleases: string;
    none: string;
    noneHint: string;
    error: string;
    errorHint: string;
  };

  footer: {
    attribution: string;
    workshop: string;
    source: string;
    builtWith: string;
  };
}

const en: SiteStrings = {
  brand: 'AOW5 utils',
  skipToContent: 'Skip to content',
  theme: 'Toggle theme',
  language: 'Language',

  nav: {
    home: 'Home',
    planner: 'Planner',
    tracker: 'Tracker',
    source: 'GitHub',
  },

  landing: {
    title: 'Two tools for Age of Weapons 5.',

    planner: {
      kicker: 'Right here, in this tab',
      title: 'Build planner',
      lead: 'Pick the hero the guide is for, then lay your build out in sections — one to start with, up to nine. The whole thing lives in the link, so sharing a build is sending someone a URL. No sign-up, nothing to install.',
      features: [
        'Every slot only takes what belongs in it — a potion slot will never offer you armour.',
        'Spells count too: choose between the abilities competing for the same key, and any key with a single option fills itself in.',
        'Up to nine sections, each with its own name and note — early game, once it comes online, late.',
        'Every item’s stats, what it is made from and what it builds into, in English or Russian.',
        'A referral code that rides along with the link you share, and never overwrites the code of whoever opens it.',
      ],
      cta: 'Open the planner',
      note: 'The build is the link. Nothing is uploaded, and nothing is kept on a server.',
    },

    tracker: {
      kicker: 'A separate download',
      title: 'Farm tracker',
      lead: 'A panel that sits on top of the game while you farm: what the evening is paying an hour, how long this room is taking, and how much of the night has actually been farming — plus everything that dropped and what it is worth.',
      features: [
        'Clicks go straight through it while you play. One hotkey when you want to change something.',
        'Collapses to three numbers: this run, gold per hour, and how long you have really been farming.',
        'Every drop listed and priced, the trader’s cut already taken off — and your own price for anything the game values wrong.',
        'A history of past sessions, and an ingredient list for whatever you are collecting toward.',
        'Reads nothing but your own log file. No game files touched, nothing automated, nothing sent anywhere.',
      ],
      cta: 'About the tracker',
      note: 'Windows. Play windowed or borderless: fullscreen covers every overlay.',
    },
  },

  tracker: {
    kicker: 'For Windows',
    title: 'Farm tracker',
    lead: 'A panel that sits on top of Dota while you farm and answers two questions: is this room worth it, and how is tonight going. Three numbers while you play, and the full list of what dropped whenever you want it.',

    windows: {
      title: 'What it puts on screen',
      lead: 'Several panels, each its own window on top of the game. Keep the ones you want; each remembers where you left it.',
      items: [
        {
          name: 'Farm panel',
          text: 'Starts small: where you are, how many runs you have done, and three numbers — this run, gold per hour, and how much of the session was really spent in rooms. Open it up for everything that dropped, sorted however you like, priced one by one and by the stack.',
        },
        {
          name: 'History',
          text: 'Past sessions, newest first, with the runs inside them. Everything is priced at today’s prices, so an old night is worth what it would be worth now.',
        },
        {
          name: 'Settings',
          text: 'Your own item prices, the items you want to watch, transparency and scale, and which log file to follow.',
        },
        {
          name: 'Recipes',
          text: 'A strip of ingredients for whatever you are collecting toward, so you can see what is still missing without leaving the game.',
        },
      ],
    },

    fitting: {
      title: 'Fitting it over your game',
      lead: 'An overlay is only useful at the size and opacity that suit the screen it is on — so both adjust, and both are remembered.',
      items: [
        {
          name: 'Collapse',
          text: 'Shrinks the panel to a single line, and the window with it, so nothing invisible is left sitting over your game.',
        },
        { name: 'Resize', text: 'Drag a corner or an edge until it is the size you want.' },
        {
          name: 'Scale',
          text: 'From 60% to 160% on a slider — or Ctrl+Alt with + / − / 0, which works even while you are playing.',
        },
        {
          name: 'Transparency',
          text: 'Off to start with, and adjustable from there. Only the panel behind the numbers fades; the numbers themselves stay readable.',
        },
      ],
    },

    setup: {
      title: 'Setting it up',
      lead: 'The tracker follows along by reading a log file that Dota can write as you play. One launch option turns it on.',
      steps: [
        'In Steam, right-click Dota 2 → Properties → Launch Options, and add: -con_logfile C:\\Users\\you\\aow5-console.log',
        'Start the tracker, press Ctrl+Alt+T so you can click it, then open Settings → Console log → Choose and pick that same file.',
        'Play windowed or borderless — fullscreen covers every overlay, this one included.',
      ],
      note: 'Dota writes its whole console to that file, so it grows quickly. The tracker can keep it small for you: there is a switch for it, and a “Trim now” button, in the same settings.',
    },

    pricing: {
      title: 'Where the gold numbers come from',
      text: 'Age of Weapons 5 runs its own economy and does not report your gold to anything outside the game, so the tracker prices what you picked up instead, using the game’s own item values. The trader pays half, so half is what it counts by default — and you can set your own price for anything worth more or less than the game says.',
    },

    privacy: {
      title: 'What it touches, and what it does not',
      text: 'It reads one thing: the log file Dota writes on your own computer. No game files are changed, nothing is read out of the game’s memory, nothing is played for you, and nothing is sent to Valve, to the addon’s authors, or anywhere else. Item pictures are the only thing it ever downloads, and your settings stay on your machine.',
    },
  },

  preview: {
    plannerCaption: 'One section of a build, as the planner draws it.',
    trackerCaption: 'The overlay, opened up and collapsed.',
    section: 'Early game',
    spells: 'Spells',
    potions: 'Potions',
    equipment: 'Equipment',
    runes: 'Runes',
    neutral: 'Neutral',
    backpack: 'Backpack',
    at: 'At',
    inHideout: 'In hideout',
    runs: 'runs',
    run: 'run',
    goldPerHour: 'g/hr',
    session: 'session',
    room: 'Skyfall Realm',
    colItem: 'item',
    colValue: 'val',
    colTotal: 'total',
    hotkeyHint: 'Ctrl+Alt+T to interact',
    collapsed: 'Collapsed',
    expanded: 'Expanded',
  },

  download: {
    checking: 'Looking for the latest version…',
    label: 'Download for Windows',
    version: (tag) => `Version ${tag}`,
    size: (mb) => `${mb} MB`,
    published: (date) => `Released ${date}`,
    allReleases: 'All versions',
    none: 'Not released yet',
    noneHint: 'The download will appear here as soon as the first version is out.',
    error: 'Could not reach GitHub',
    errorHint: 'Every version is listed on the downloads page.',
  },

  footer: {
    attribution:
      'Fan-made tools for the Age of Weapons 5 custom game. Not affiliated with or endorsed by Valve. Dota 2 and its item art are property of Valve Corporation; the Age of Weapons 5 data and custom art belong to the addon’s authors, and are used here only to display information about the custom game.',
    workshop: 'Age of Weapons 5 on the Steam Workshop',
    source: 'GitHub',
    builtWith: 'Free and open source. No ads, no analytics, no accounts.',
  },
};

const ru: SiteStrings = {
  brand: 'AOW5 utils',
  skipToContent: 'Перейти к содержимому',
  theme: 'Переключить тему',
  language: 'Язык',

  nav: {
    home: 'Главная',
    planner: 'Планировщик',
    tracker: 'Трекер',
    source: 'GitHub',
  },

  landing: {
    title: 'Два инструмента для Age of Weapons 5.',

    planner: {
      kicker: 'Прямо в этой вкладке',
      title: 'Планировщик сборок',
      lead: 'Выберите героя, под которого пишется гайд, и разложите сборку по разделам — от одного до девяти. Всё это живёт прямо в ссылке: поделиться сборкой — значит отправить ссылку. Ни регистрации, ни установки.',
      features: [
        'В каждую ячейку кладётся только то, что ей подходит: в ячейке зелий вам никогда не предложат броню.',
        'Заклинания тоже считаются: выбирайте между способностями, которые спорят за одну клавишу, а клавиша с единственным вариантом заполнится сама.',
        'До девяти разделов, у каждого своё название и заметка: ранняя игра, момент, когда сборка заработала, поздняя.',
        'Характеристики каждого предмета, из чего он собирается и во что входит — на русском или английском.',
        'Реферальный код, который едет вместе с вашей ссылкой и не затирает код того, кто её открыл.',
      ],
      cta: 'Открыть планировщик',
      note: 'Сборка — это и есть ссылка. Ничего никуда не загружается и не хранится на сервере.',
    },

    tracker: {
      kicker: 'Отдельная загрузка',
      title: 'Трекер фарма',
      lead: 'Панель поверх игры, пока вы фармите: сколько вечер приносит в час, сколько тянется эта комната и сколько времени вы на самом деле фармили — плюс всё, что выпало, и сколько это стоит.',
      features: [
        'Клики проходят сквозь неё, пока вы играете. Одна горячая клавиша — когда нужно что-то поменять.',
        'Сворачивается до трёх чисел: текущий забег, золото в час и сколько вы действительно фармили.',
        'Всё, что выпало, с ценой и уже вычтенной долей торговца — и своя цена для всего, что игра оценивает неверно.',
        'История прошлых сессий и список ингредиентов для того, к чему вы собираете.',
        'Читает только ваш собственный лог-файл. Игровые файлы не трогает, ничего не автоматизирует, никуда ничего не отправляет.',
      ],
      cta: 'Про трекер',
      note: 'Windows. Играйте в оконном или безрамочном режиме: полноэкранный закрывает любой оверлей.',
    },
  },

  tracker: {
    kicker: 'Для Windows',
    title: 'Трекер фарма',
    lead: 'Панель поверх Dota, пока вы фармите. Отвечает на два вопроса: стоит ли эта комната времени и как идёт вечер. Три числа, пока вы играете, и полный список добычи, когда он понадобится.',

    windows: {
      title: 'Что появляется на экране',
      lead: 'Несколько панелей, каждая — своё окно поверх игры. Оставляйте те, что нужны; каждая помнит, где вы её оставили.',
      items: [
        {
          name: 'Панель фарма',
          text: 'Начинает маленькой: где вы находитесь, сколько забегов сделали, и три числа — текущий забег, золото в час и сколько времени сессии вы правда провели в комнатах. Разверните — и увидите всё, что выпало, в любой сортировке, с ценой поштучно и за стак.',
        },
        {
          name: 'История',
          text: 'Прошлые сессии, свежие сверху, с забегами внутри. Всё пересчитано по сегодняшним ценам, так что старый вечер стоит столько, сколько стоил бы сейчас.',
        },
        {
          name: 'Настройки',
          text: 'Свои цены на предметы, список тех, за кем следить, прозрачность и масштаб, и какой лог-файл читать.',
        },
        {
          name: 'Рецепты',
          text: 'Полоска ингредиентов для того, к чему вы собираете, — видно, чего ещё не хватает, не выходя из игры.',
        },
      ],
    },

    fitting: {
      title: 'Подогнать под свою игру',
      lead: 'Оверлей полезен только в том размере и той прозрачности, которые подходят вашему экрану, — поэтому настраивается и то и другое, и панель это запоминает.',
      items: [
        {
          name: 'Сворачивание',
          text: 'Сжимает панель до одной строки, а вместе с ней и окно, чтобы поверх игры не осталось ничего невидимого.',
        },
        { name: 'Размер', text: 'Тяните за угол или за край, пока не станет как надо.' },
        {
          name: 'Масштаб',
          text: 'От 60% до 160% ползунком — или Ctrl+Alt и + / − / 0, что работает прямо во время игры.',
        },
        {
          name: 'Прозрачность',
          text: 'Сначала выключена, дальше — как захотите. Растворяется только подложка под числами; сами числа остаются читаемыми.',
        },
      ],
    },

    setup: {
      title: 'Как настроить',
      lead: 'Трекер следит за игрой, читая лог-файл, который Dota умеет писать по ходу дела. Включается одним параметром запуска.',
      steps: [
        'В Steam правой кнопкой по Dota 2 → Свойства → Параметры запуска, добавьте: -con_logfile C:\\Users\\you\\aow5-console.log',
        'Запустите трекер, нажмите Ctrl+Alt+T, чтобы по нему можно было кликать, откройте Настройки → Консольный лог → Выбрать и укажите тот же файл.',
        'Играйте в оконном или безрамочном режиме — полноэкранный закрывает любой оверлей, включая этот.',
      ],
      note: 'Dota пишет в этот файл всю консоль, так что он быстро растёт. Трекер умеет держать его маленьким: в тех же настройках есть переключатель и кнопка «Обрезать сейчас».',
    },

    pricing: {
      title: 'Откуда берутся числа в золоте',
      text: 'У Age of Weapons 5 своя экономика, и наружу она ваше золото не сообщает — поэтому трекер оценивает то, что вы подобрали, по игровым стоимостям предметов. Торговец платит половину, поэтому по умолчанию считается половина; а для всего, что стоит больше или меньше, чем говорит игра, можно задать свою цену.',
    },

    privacy: {
      title: 'Что он трогает, а что нет',
      text: 'Читает он одно: лог-файл, который Dota пишет на вашем компьютере. Игровые файлы не меняются, память игры не читается, за вас никто не играет, и ничего не отправляется ни Valve, ни авторам аддона, ни куда-либо ещё. Единственное, что он вообще скачивает, — картинки предметов, а настройки остаются на вашей машине.',
    },
  },

  preview: {
    plannerCaption: 'Один раздел сборки — так, как его рисует планировщик.',
    trackerCaption: 'Оверлей: развёрнутый и свёрнутый.',
    section: 'Ранняя игра',
    spells: 'Заклинания',
    potions: 'Зелья',
    equipment: 'Снаряжение',
    runes: 'Руны',
    neutral: 'Нейтральный',
    backpack: 'Рюкзак',
    at: 'В',
    inHideout: 'В убежище',
    runs: 'забеги',
    run: 'забег',
    goldPerHour: 'з/час',
    session: 'сессия',
    room: 'Царство Небопада',
    colItem: 'предмет',
    colValue: 'цена',
    colTotal: 'итого',
    hotkeyHint: 'Ctrl+Alt+T — взаимодействие',
    collapsed: 'Свёрнутая',
    expanded: 'Развёрнутая',
  },

  download: {
    checking: 'Ищем последнюю версию…',
    label: 'Скачать для Windows',
    version: (tag) => `Версия ${tag}`,
    size: (mb) => `${mb} МБ`,
    published: (date) => `Вышла ${date}`,
    allReleases: 'Все версии',
    none: 'Ещё не вышло',
    noneHint: 'Загрузка появится здесь, как только выйдет первая версия.',
    error: 'Не удалось связаться с GitHub',
    errorHint: 'Все версии перечислены на странице загрузок.',
  },

  footer: {
    attribution:
      'Фанатские инструменты для пользовательской игры Age of Weapons 5. Не связаны с Valve и не одобрены ею. Dota 2 и изображения предметов принадлежат Valve Corporation; данные и оригинальные изображения Age of Weapons 5 принадлежат авторам аддона и используются здесь только для показа информации о пользовательской игре.',
    workshop: 'Age of Weapons 5 в Steam Workshop',
    source: 'GitHub',
    builtWith: 'Бесплатно и с открытым исходным кодом. Ни рекламы, ни аналитики, ни аккаунтов.',
  },
};

export const SITE: Record<Lang, SiteStrings> = { en, ru };
