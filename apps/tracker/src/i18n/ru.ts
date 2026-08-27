import type { CardId } from '@core/cards.ts';
import type { RunOutcome } from '@core/stats.ts';
import type { LogTrim, UpdateState } from '@core/ipc.ts';
import type { Messages } from './en';

/**
 * Русский.
 *
 * Typed against `Messages`, so this file cannot fall behind English: a string
 * added there is a compile error here until it is translated.
 *
 * Two things are said differently here rather than translated word for word.
 * The room line drops the English preposition — «В Ледяная равнина» is not
 * Russian, and the room names arrive from the game in the nominative — so it
 * says «Комната: » instead and keeps «В убежище» for the one name that is a
 * word rather than a place. And every count runs through `plural` below,
 * because a bare `${n} забегов` is wrong two times in ten.
 */

/**
 * The three forms Russian counts in.
 *
 * 1, 21, 31 take `one`; 2–4, 22–24 take `few`; everything else — 0, 5–20, and
 * the teens whatever their last digit — takes `many`. Written out rather than
 * pulled from `Intl.PluralRules` because the catalogs are plain data and this
 * is four lines.
 */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const ru: Messages = {
  common: {
    cancel: 'Отмена',
    close: 'Закрыть это окно',
    refresh: 'Обновить',
    choose: 'Выбрать',
    notSet: 'Не задан',
    none: '—',
  },

  window: {
    brand: 'AOW5',
    farm: 'трекер',
    settings: 'настройки',
    history: 'история',
  },

  shell: {
    expand: 'Развернуть до полной сводки',
    collapse: 'Свернуть до карточек',
    pinHint: (hotkey: string) => `${hotkey} — снять фокус и закрепить поверх игры`,
    configureHint: (hotkey: string) => `${hotkey} — настроить`,
  },

  farm: {
    startClock: 'Запустить часы сессии',
    pauseClock: 'Остановить часы сессии — добыча продолжит считаться',
    restart: 'Начать новую сессию — все числа обнулятся',
    undoDeath: 'Вернуть — засчитать последнюю комнату снова',
    markDeath: 'Здесь я погиб — убрать добычу этой комнаты из сессии, время оставить',
    history: 'История',
    settings: 'Настройки',
    quit: 'Выйти из трекера',
  },

  stateLine: {
    inHideout: 'В ',
    /* Русский требует предложного падежа, а названия приходят из игры в
       именительном, поэтому здесь двоеточие вместо предлога. */
    atRoom: 'Комната: ',
    hideout: 'убежище',
    runs: 'Забегов завершено за сессию',
  },

  hud: {
    /*
     * Terser than the names in Settings below, and they have to be.
     *
     * A card is a third of a 600px panel and the label truncates before
     * anything else on it does — English gets thirteen characters there, and
     * «золото за комнату» is seventeen. The full wording is one section down,
     * where it is read once with attention; here it only has to be
     * distinguishable from the five labels around it.
     */
    cardLabel: {
      session: 'время сессии',
      sessionGold: 'золото сессии',
      sessionBest: 'лучший дроп',
      mapTime: 'время комнаты',
      mapGold: 'золото комнаты',
      mapGoldAverage: 'сред. золото',
      mapTimeAverage: 'сред. время',
      goldPerHour: 'золото в час',
    } as Record<CardId, string>,
    cardTitle: {
      session: 'С начала сессии — убежище и загрузки тоже считаются',
      sessionGold: 'Всё, что выпало за сессию, по тем же ценам, что и в списке',
      sessionBest: 'Самый дорогой предмет за сессию',
      mapTime: 'Сколько вы уже в комнате, где стоите',
      mapGold: 'Что выпало в комнате ниже, по тем же ценам, что и в списке',
      mapGoldAverage: 'Среднее золото завершённых комнат за сессию — открытая пока не считается',
      mapTimeAverage: 'Среднее время завершённых комнат за сессию',
      goldPerHour: 'Золото в час, считая только время внутри комнат',
    } as Record<CardId, string>,
    bestTitle: (item: string) => `${item} — самая дорогая стопка сессии`,
    columns: {
      name: 'добыча',
      unit: 'цена',
      total: 'всего',
    },
    sortBy: (column: string) => `Сортировать по «${column}»`,
    emptyTracked: 'Отслеживаемых предметов в этой комнате пока нет.',
    empty: 'Здесь пока ничего не выпало.',
    customPrice: (table: number) => `Ваша цена. Без неё этот предмет шёл бы за ${table}з.`,
  },

  recipe: {
    add: 'Добавить рецепт или предмет',
    addLabel: 'рецепт',
    stopCrafting: (item: string) => `Не крафтить «${item}»`,
    stopCraftingHint: 'Перестать это крафтить — считать обычным материалом',
    craftInstead: (item: string) => `Крафтить «${item}» самому`,
    craftInsteadHint: 'Крафтить это самому — вынести в отдельную строку',
    oneFewer: (item: string) => `«${item}» на один меньше`,
    oneFewerHint: 'На один меньше',
    removeTarget: (item: string) => `Убрать «${item}»`,
    removeTargetHint: 'Убрать',
    oneMore: (item: string) => `«${item}» на один больше`,
    oneMoreHint: 'На один больше',
    tickHint: (item: string, have: number, need: number) => `${item} ${have}/${need} — нажмите, чтобы отметить`,
    ingredient: (item: string, have: number, need: number) => `${item}, ${have} из ${need}`,
    picker: {
      recipes: 'рецепты',
      anyItem: 'любой предмет',
      searchRecipes: 'Поиск рецептов…',
      searchItems: 'Поиск предметов…',
      loading: 'Рецепты загружаются…',
      noRecipe: 'Крафтящихся предметов с таким названием нет. Попробуйте «любой предмет».',
      noItem: 'Предмета с таким названием нет.',
    },
  },

  history: {
    reading: 'Читаем архив…',
    empty:
      'Пока ничего не записано. Сессия попадёт сюда, когда завершится её первый забег — тот, в котором вы сейчас, ещё принадлежит оверлею.',
    select: (when: string) => `Выбрать сессию от ${when}`,
    mock: 'тест',
    runCount: (runs: number) => `${runs} ${plural(runs, 'забег', 'забега', 'забегов')}`,
    stats: {
      active: 'в игре',
      gold: 'золото',
      value: 'ценность',
      items: 'предметы',
    },
    noRuns: 'Забегов нет.',
    sessionTotal: 'итог сессии',
    itemCount: (items: number) => `${items} ${plural(items, 'предмет', 'предмета', 'предметов')}`,
    nothingDropped: 'Ничего не выпало.',
    deleteSelectedHint: 'Удалить отмеченные сессии и записанные в них забеги.',
    deleteAllHint: 'Удалить все сессии из архива. Сессия на экране продолжит считаться.',
    deleteSelected: (count: number) => `Удалить ${count}`,
    confirmSelected: (count: number) => `Удалить ${count}?`,
    deleteAll: 'Очистить всё',
    confirmAll: 'Удалить всё?',
    newer: 'Новее',
    older: 'Старее',
    page: (current: number, total: number) => `${current} / ${total}`,
    pageHint: (current: number, total: number) => `Страница ${current} из ${total}`,
    outcome: {
      open: 'идёт',
      clear: 'зачищена',
      chained: 'подряд',
      abandoned: 'брошена',
      other: 'иное',
      died: 'смерть',
    } as Record<RunOutcome, string>,
  },

  settings: {
    prices: {
      title: 'Цены предметов',
      blurb:
        'В таблицах записано, за сколько предмет продаётся, а это не всегда то, сколько он стоит для вас. Задайте свою цену — и за ней пойдут все золотые числа: золото в час, итог сессии, список добычи и архив. Предметы, о которых вы ничего не сказали, остаются по табличной цене.',
      halve: 'Торговец платит половину',
      halveHint:
        'Торговец скупает за половину табличной цены, поэтому весь дроп без своей цены считается вполовину. Цены, заданные ниже, в любом случае берутся ровно такими, какими вы их задали.',
      search: 'Найдите предмет, чтобы задать цену…',
      table: (gold: string) => `таблица ${gold}`,
      tableHint: 'Сколько он стоил бы без вашей цены',
      field: (item: string) => `Цена для «${item}»`,
      clear: (item: string) => `Убрать вашу цену для «${item}»`,
      clearHint: 'Убрать эту цену — вернуться к табличной',
    },
    tracked: {
      title: 'Отслеживаемые предметы',
      blurb:
        'Закрепите то, что вам важно, и развёрнутая сводка покажет только это — и итог сессии по тем же предметам. Если не закреплено ничего, в списке всё, что подобрано. В историю всё равно попадает всё, что бы здесь ни было закреплено.',
      search: 'Поиск по названию…',
      untrack: (item: string) => `Перестать отслеживать «${item}»`,
      untrackHint: 'Перестать отслеживать',
    },
    shortcuts: {
      title: 'Горячие клавиши',
      blurb:
        'Клавиши, на которые трекер отвечает, пока игра в фокусе. Клавиша действия — это модификатор, на котором держатся все остальные: смените её один раз, и все сочетания переедут вместе с ней.',
      actionKey: 'Клавиша действия',
      actionKeyHint: 'Удерживается вместе с каждым сочетанием ниже, чтобы ни одно не совпало с клавишей игры.',
      name: {
        focus: 'Фокус на оверлее',
        die: 'Отметить последнюю комнату как смерть',
      } as Record<string, string>,
      hint: {
        focus: 'Делает панели кликабельными — можно двигать, менять размер и настраивать. Нажмите ещё раз, чтобы закрепить их поверх игры.',
        die: 'То же, что череп в заголовке, но без перевода фокуса на оверлей: добыча перестаёт считаться в сессию, а минуты — считаются.',
      } as Record<string, string>,
      record: 'Нажмите клавишу…',
      recordHint: 'Щёлкните и нажмите нужную клавишу. Esc оставит как есть.',
      rebind: (action: string) => `Сменить клавишу: ${action}`,
      reset: 'Сбросить',
      resetHint: 'Вернуть клавишу по умолчанию',
      clash: 'Две команды на одной клавише — сработает только одна.',
      taken: 'Эта клавиша уже занята другим приложением.',
    },
    sounds: {
      title: 'Звуки',
      enabled: 'Звук при выпадении',
      enabledHint:
        'Звучит один раз на каждый подходящий подбор — по грейду ниже или по звуку, назначенному самому предмету. «Алое сердце» привязано к джекпоту из коробки; отвяжете — так и останется.',
      volume: 'Громкость',
      limit: 'Обрезать длинные звуки',
      limitHint: 'Плавно приглушать звук через несколько секунд, а не проигрывать файл целиком.',
      limitAfter: 'Обрезать через',
      seconds: (value: number) => `${value} с`,
      rules: 'По грейду',
      rulesHint:
        'Звук, назначенный самому предмету, важнее качества, качество — важнее уровня. На один дроп звучит один звук, что бы он ни задел.',
      byQuality: 'Качество',
      byLevel: 'Уровень',
      rarity: {
        1: 'Обычное',
        2: 'Необычное',
        3: 'Редкое',
        4: 'Эпическое',
        5: 'Легендарное',
        6: 'Мифическое',
        7: 'Божественное',
      } as Record<number, string>,
      level: (n: number) => `Ур. ${n}`,
      rule: (grade: string) => `Звук для «${grade}»`,
      builtins: 'В комплекте',
      find: 'Найти звук',
      findHint:
        'Ищет на Freesound — библиотеке звуков под Creative Commons. Добавленный звук скачивается и хранится вместе с настройками, с автором и лицензией, — потом привяжите его к предмету или к градации выше. Большая часть библиотеки просит лишь указать автора.',
      findPlaceholder: 'монеты, фанфары, взрыв…',
      by: (who: string) => `автор: ${who}`,
      add: (sound: string) => `Добавить «${sound}»`,
      addHint: 'Добавить и прослушать',
      addFail: 'Не удалось скачать этот звук.',
      noHits: 'Ничего не найдено. Попробуйте слово проще.',
      searchFail: {
        off: 'Поиск звуков отключён в конфиге.',
        offline: 'Не удалось связаться с сервером поиска.',
        unconfigured: 'На этом сервере нет ключа к библиотеке звуков.',
        busy: 'Слишком много запросов. Попробуйте через минуту.',
        failed: 'Поиск не вернул ничего пригодного.',
      },
      filter: 'Фильтр звуков…',
      noMatch: 'Звука с таким именем нет',
      choose: 'Выбрать файл…',
      remove: 'Убрать',
      search: 'Найдите предмет, чтобы привязать звук…',
      play: (sound: string) => `Проиграть «${sound}»`,
      playHint: 'Проиграть',
      pick: (item: string) => `Выбрать звук для «${item}»`,
      pickHint: 'Выбрать файл',
      unbind: (item: string) => `Отвязать «${item}»`,
      unbindHint: 'Отвязать',
      floor: 'Только дороже цены',
      floorHint:
        'Дешёвая добыча молчит независимо от грейда. Считается по цене одной штуки в ваших ценах — не по стопке, так что большая стопка дешёвого всё равно дешёвая.',
      floorField: 'Минимальная стоимость дропа',
      muted: 'Никогда не звучат',
      mutedHint:
        'Предметы, которые молчат, что бы их ни озвучивало, включая их собственный звук. Выберите редкость или уровень, чтобы посмотреть тир, или найдите по названию.',
      mutedAny: 'Любой',
      mutedSearch: 'Найти предмет, чтобы заглушить…',
      mutedEmpty: 'Пока ничего не заглушено.',
      mutedMore: (n: number) => `ещё ${n} — сузьте отбор`,
      mutedNone: 'В этом грейде нет предметов.',
      mute: (item: string) => `Заглушить ${item}`,
      muteHint: 'Никогда не звучит',
      unmute: (item: string) => `Вернуть звук ${item}`,
      unmuteHint: 'Вернуть звук',
      perItem: 'По предмету',
      perItemHint: 'Звук на самом предмете важнее обеих сеток ниже.',
      silencedMuted: 'Заглушено ниже — звучать не будет',
      silencedFloor: 'Дешевле порога — звучать не будет',
    },
    session: {
      title: 'Сессия',
      autoResume: 'Запускать часы на первой комнате',
      autoResumeHint:
        'Сессия начинается на паузе, чтобы трекер мог висеть открытым, пока грузится Dota, и это не считалось фармом. С этой галочкой вход в комнату нажимает «play» за вас. Пауза, поставленная посреди сессии, всё равно держится до следующей комнаты.',
    },
    cards: {
      title: 'Карточки HUD',
      blurb:
        'Карточки на оверлее фарма, по три в ряд и в порядке ниже. Выключенная карточка не оставляет дыры — остальные сдвигаются, сохраняя порядок, так что ряд всегда заполнен слева. Сам порядок менять нельзя: ряды читаются как «сессия» и «комната».',
      lastOne: (hint: string) => `${hint} HUD нужна хотя бы одна карточка; включите другую, чтобы освободить эту.`,
      name: {
        session: 'Время сессии',
        sessionGold: 'Золото сессии',
        sessionBest: 'Лучшее за сессию',
        mapTime: 'Время в комнате',
        mapGold: 'Золото комнаты',
        mapGoldAverage: 'Золото за комнату',
        mapTimeAverage: 'Время на комнату',
        goldPerHour: 'Золото в час',
      } as Record<CardId, string>,
      hint: {
        session: 'С начала сессии. Убежище и загрузки тоже считаются.',
        sessionGold: 'Всё, что выпало за сессию, по вашим ценам.',
        sessionBest: 'Самая дорогая стопка, показанная своей иконкой.',
        mapTime: 'Сколько вы уже в комнате, где стоите.',
        mapGold: 'Что выпало в комнате ниже, по тем же ценам, что и в списке.',
        mapGoldAverage: 'Среднее золото завершённых комнат. Открытая не считается, пока не закончится.',
        mapTimeAverage: 'Среднее время зачистки завершённых комнат.',
        goldPerHour: 'Считая только время внутри комнат, без убежища.',
      } as Record<CardId, string>,
    },
    language: {
      title: 'Язык',
      blurb:
        'Слова самого оверлея, а вместе с ними названия предметов и комнат — таблицы несут все три языка, так что наполовину переведённого окна не будет. «Автоматически» идёт за языком Windows.',
      auto: 'Автоматически',
      en: 'English',
      ru: 'Русский',
      zh: '简体中文',
    },
    style: {
      title: 'Стиль трекера',
      blurb:
        'Как устроена сводка, а не только какого она цвета. «Минималистичный» даёт каждому числу одинаковую карточку — читайте то, за которым пришли. «Torchlight» выносит лучший дроп сессии крупно наверх, а всё остальное убирает в полосу мелких цифр под ним.',
      minimal: 'Минималистичный',
      minimalHint: 'Шесть равных карточек на матовой плите. Не лезет в глаза поверх игры.',
      torchlight: 'Torchlight',
      torchlightHint: 'Лучший дроп — крупно. Всё остальное строкой под ним, в духе панели добычи из ARPG.',
    },
    appearance: {
      title: 'Внешний вид',
      transparent: 'Прозрачный фон',
      transparentHint: 'Пусть игра просвечивает сквозь панель. Сама сводка в любом случае остаётся плотной.',
      background: 'Фон',
      scale: 'Масштаб интерфейса',
      blurb:
        'Ctrl +/− тоже меняет масштаб, а Ctrl+Alt +/− делает это без предварительного клика по окну. Шеврон сворачивает панель до карточек, а они ровно такой высоты, какие есть, — там угол тянет только ширину. В развёрнутом виде панель держит ту высоту, до которой вы её растянули.',
    },
    log: {
      title: 'Лог консоли',
      blurb:
        'Dota пишет консоль клиента в файл, если запустить её с -con_logfile. Укажите трекеру этот файл, и он будет читать строки трекера прямо по мере их появления.',
      optimization: 'Оптимизация',
      trim: 'Держать лог небольшим',
      trimNow: 'Обрезать сейчас',
    },
    rooms: {
      title: 'По комнатам',
      room: 'комната',
      runs: 'забеги',
      average: 'сред.',
      items: 'предметы',
    },
    skipped: {
      title: 'Непрочитанные строки',
      blurb: 'Игра прислала строки трекера, которые эта сборка не смогла разобрать — скорее всего, изменилась схема.',
    },
    about: {
      title: 'О программе',
      app: 'AOW5 Tracker',
    },
  },

  update: {
    download: 'Скачать',
    restart: 'Перезапустить и обновить',
    check: 'Проверить обновления',
    unsupportedBlurb:
      'Обновления — для установленной сборки. Эта запущена из исходников, так что и обновляется как исходники.',
    describe: (state: UpdateState, notes: string | null): string => {
      switch (state.status) {
        case 'unsupported':
          return 'Обновлять себя может только установленная сборка.';
        case 'idle':
          return '';
        case 'checking':
          return 'Спрашиваем GitHub…';
        case 'current':
          return 'Это самая свежая сборка.';
        case 'available':
          return notes === null ? `Вышла ${state.version}.` : `Вышла ${state.version} — ${notes}`;
        case 'downloading':
          return `Скачиваем ${state.version}… ${state.percent}%`;
        case 'ready':
          return `${state.version} готова. Перезапуск оборвёт забег, в котором вы сейчас.`;
        case 'error':
          return `Не удалось проверить: ${state.message}`;
      }
    },
  },

  trim: (trim: LogTrim, mb: (bytes: number) => string): string => {
    switch (trim.skipped) {
      case 'in-use':
        return `Файл всё ещё занят Dota${trim.error === undefined ? '' : ` (${trim.error})`} — пока ${mb(trim.before)}.`;
      case 'missing':
        return 'Лога там пока нет. Dota пишет его, когда запущена с -con_logfile.';
      case 'small':
        return 'В нём и так только строки трекера.';
      default:
        return `${mb(trim.before)} → ${mb(trim.after)}, оставлено строк трекера: ${trim.kept}.`;
    }
  },
};
