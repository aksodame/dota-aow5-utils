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

  /** Labels for every copy button on the site. See `CopyBlock`. */
  copy: {
    label: string;
    done: string;
    failed: string;
  };

  nav: {
    home: string;
    planner: string;
    tracker: string;
    source: string;
  };

  /**
   * Signing in, and what it is for.
   *
   * The planner does not need an account and never will — a board still
   * encodes into a link with nobody signed in. An account is only for the
   * things that involve other people: publishing a build, commenting on one,
   * voting on one. The copy has to make that difference obvious, because a
   * sign-in button on a tool that has never needed one reads as a demand.
   *
   * Valve requires their own wording and button art for the sign-in control
   * itself, so `signIn` labels the surrounding control rather than replacing it.
   */
  auth: {
    signIn: string;
    signInWhy: string;
    signOut: string;
    account: string;
    myBuilds: string;
    /** "{n} of {max}" — the author's five slots. */
    buildCount: string;
    signInFailed: string;
    signInExpired: string;
  };

  /**
   * The Builds section.
   *
   * One section, two halves: making a board and reading somebody else's. They
   * share a second-level bar, and signing in lives there because an account
   * only ever buys something here — publishing, commenting, voting.
   *
   * Kept apart from `strings.ts`, which is the planner's own UI. That file
   * changes when the board changes; this one changes when the section around it
   * does.
   *
   * There is deliberately **no language facet**. It was inferred from whichever
   * language the reader had the site set to, which is not the language anyone
   * wrote in — and on a site this size, splitting an already-small pool of
   * builds by a guessed field made both halves worse.
   */
  builds: {
    title: string;
    lead: string;

    /**
     * The two nav entries this section owns.
     *
     * `navMine` appears only when somebody is signed in — a tab whose only
     * purpose is to ask you to sign in is a demand, not a destination — and
     * `navNew` is the action on the right of the bar rather than a tab, because
     * it makes something instead of going somewhere.
     */
    navNew: string;
    navMine: string;

    empty: string;
    emptySearch: string;
    searchLabel: string;
    searchPlaceholder: string;
    sort: { new: string; top: string; discussed: string };
    anyHero: string;
    more: string;
    loading: string;
    failed: string;
    retry: string;

    by: string;
    deleted: string;
    notFound: string;
    backToBuilds: string;
    draft: string;
    commentsTitle: string;
    commentPlaceholder: string;
    postComment: string;
    selfVote: string;

    /** Saving, from the planner. */
    publish: string;
    publishTitle: string;
    publishLead: string;
    fieldTitle: string;
    fieldTitlePlaceholder: string;
    fieldBody: string;
    fieldBodyPlaceholder: string;
    saveDraft: string;
    publishAction: string;
    cancel: string;
    published: string;
    publishedLead: string;
    limitReached: string;
    signInToPublish: string;

    /** Editing a build that is already saved. */
    saveChanges: string;
    saved: string;
    saveAsMine: string;
    saveAsMineWhy: string;
    signInToSave: string;

    /** The author's own five. */
    mineTitle: string;
    mineLead: string;
    mineEmpty: string;
    slotsUsed: string;
    unpublish: string;
    delete: string;
    deleteConfirm: string;
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
      /**
       * The launch option itself, verbatim and untranslated.
       *
       * Its own field rather than a sentence inside `steps`, because it is the
       * one string on this page that has to survive being copied: a flag with a
       * word translated or a dash smartened is a flag that silently does
       * nothing, and the reader has no way to tell which half was the mistake.
       */
      launchOption: string;
      /**
       * Where the log is suggested to live, as a full Windows path.
       *
       * A suggestion and not a requirement — the point of making the reader
       * create the file themselves is that they choose somewhere they will
       * find again. It carries \u201cyou\u201d as the Windows user name for the same
       * reason the launch option does, and the steps say to change it.
       */
      logPath: string;
      /** The green callout carrying it. Nobody who skims may miss this step. */
      alert: { title: string; text: string };
      /**
       * The numbered walkthrough. Each step may name one of the two boxes
       * above it rather than repeating the text inside — see `launchOption`.
       */
      steps: string[];
      /** Heading over the file box, and over the launch-option box. */
      labels: { file: string; option: string };
      /**
       * The path warning, and the reason it is not a footnote.
       *
       * Two ways to get a silently empty log, both of which look identical to
       * a broken download: a folder whose name is not plain English letters,
       * and an extension Dota was never asked for. Neither errors — the game
       * starts, plays, and writes nothing.
       */
      pathWarning: string;
      note: string;

      /**
       * The optional one: quieten Dota's logging at the source.
       *
       * Last, and marked optional in its own first sentence, because the
       * tracker works without it — it trims the log itself. What this buys is
       * a log that never gets big in the first place, which matters to anyone
       * who would rather the game not write 12 MB an evening.
       *
       * `cfgPath` is relative to the Steam folder rather than absolute: unlike
       * the log, this file's location is not the reader's choice, and the only
       * part that varies is where Steam itself lives.
       */
      tuning: {
        /** The summary line, and all a collapsed reader ever sees. */
        title: string;
        text: string;
        cfgPath: string;
        cfgLabel: string;
        /** The caveat that stops a stale channel list being read as a failure. */
        caveat: string;
        /** What to do instead, for anyone who skips this. */
        instead: string;
      };
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
  copy: {
    label: 'Copy',
    done: 'Copied',
    failed: 'Copy failed — select the text and copy it manually',
  },
  skipToContent: 'Skip to content',
  theme: 'Toggle theme',
  language: 'Language',

  nav: {
    home: 'Home',
    planner: 'Builds',
    tracker: 'Tracker',
    source: 'GitHub',
  },

  auth: {
    signIn: 'Sign in through Steam',
    signInWhy: 'Only needed to publish a build, comment or vote. The planner works without an account.',
    signOut: 'Sign out',
    account: 'Account',
    myBuilds: 'My builds',
    buildCount: '{n} of {max}',
    signInFailed: 'Steam could not confirm that sign-in. Please try again.',
    signInExpired: 'That sign-in took too long. Please try again.',
  },

  builds: {
    title: 'Builds',
    lead: 'Builds people have published, with the board they actually played.',

    navNew: 'New build',
    navMine: 'My builds',

    empty: 'No builds published yet. The first one could be yours.',
    emptySearch: 'Nothing matched that.',
    searchLabel: 'Search builds',
    searchPlaceholder: 'Title or summary',
    sort: { new: 'Newest', top: 'Top rated', discussed: 'Most discussed' },
    anyHero: 'Any hero',
    more: 'Load more',
    loading: 'Loading',
    failed: 'Something went wrong.',
    retry: 'Try again',

    by: 'by',
    deleted: 'This build was deleted.',
    notFound: 'No build at that link.',
    backToBuilds: 'Back to builds',
    draft: 'Draft',
    commentsTitle: 'Comments',
    commentPlaceholder: 'What worked, what you would change.',
    postComment: 'Post',
    selfVote: 'You cannot vote on your own build.',

    publish: 'Save as a build',
    publishTitle: 'Save this build',
    publishLead: 'It gets its own link and appears in search. You can edit or delete it afterwards.',
    fieldTitle: 'Title',
    fieldTitlePlaceholder: 'Axe jungle route',
    fieldBody: 'Notes',
    fieldBodyPlaceholder: 'When to buy what, what to skip, anything the board cannot say.',
    saveDraft: 'Save as draft',
    publishAction: 'Publish',
    cancel: 'Cancel',
    published: 'Saved',
    publishedLead: 'Anyone with this link can read it.',
    limitReached: 'You already have five builds. Delete one to make room.',
    signInToPublish: 'Sign in through Steam to save this build. The share link above works without an account.',

    saveChanges: 'Save changes',
    saved: 'Saved',
    saveAsMine: 'Save as my own',
    saveAsMineWhy: 'Copies this board into your builds as a draft. The original is untouched.',
    signInToSave: 'Sign in through Steam to keep your changes. Editing here works either way.',

    mineTitle: 'My builds',
    mineLead: 'Five slots. Deleting one frees it immediately.',
    mineEmpty: 'Nothing saved yet. Make a board and save it from there.',
    slotsUsed: '{n} of {max} slots used',
    unpublish: 'Make draft',
    delete: 'Delete',
    deleteConfirm: 'Delete this build? The link stops working for everyone.',
  },

  landing: {
    title: 'Two tools for Age of Weapons 5.',

    planner: {
      kicker: 'Right here, in this tab',
      title: 'Build planner',
      lead: 'Pick the hero the build is for, then lay your build out in sections — one to start with, up to nine. The whole thing lives in the link, so sharing a build is sending someone a URL. No sign-up, nothing to install.',
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
      lead: 'The tracker follows along by reading a log file that Dota can write as you play. Make the file, point the game at it, then point the tracker at it — the same path all three times.',
      logPath: 'C:\\Users\\Public\\aow5-console.log',
      launchOption: '-con_logfile C:\\Users\\Public\\aow5-console.log',
      pathWarning: 'Keep the path in plain English letters, and keep the .log ending. A folder named in Russian — which is what your user folder is, if your Windows account name is — makes Dota write nothing at all, and it does not complain: the game runs normally and the file stays empty, which reads exactly like a broken download. C:\\Users\\Public is suggested above because it is spelled the same on every Windows machine, needs no permissions, and sidesteps the problem entirely.',
      labels: {
        file: 'The file — make this one first',
        option: 'The launch option — same path, after -con_logfile',
      },
      alert: {
        title: 'Dota needs one launch option, or the tracker sees nothing',
        text: 'Without it the game writes nothing, the overlay reads an empty file, and every number stays at zero — which looks exactly like a broken download. Both boxes must end in the same path, and it must be the file you made in step one.',
      },
      steps: [
        'Make the file yourself. Open C:\\Users\\Public, right-click → New → Text Document, and rename it to aow5-console.log — including the ending, which means turning on View → File name extensions in Explorer if you have not. Making it first is what lets you pick it in step three: the tracker opens a file dialog, and a dialog cannot select a file that does not exist yet.',
        'In Steam, right-click Dota 2 → Properties → Launch Options, and paste the launch option above — with your path, if you chose a different one.',
        'Start the tracker, press Ctrl+Alt+T so you can click it, then open Settings → Console log → Choose, and pick the file you made.',
        'Play windowed or borderless — fullscreen covers every overlay, this one included.',
      ],
      note: 'Dota writes its whole console to that file, so it grows quickly. The tracker can keep it small for you: there is a switch for it, and a “Trim now” button, in the same settings.',

      tuning: {
        title: 'Optional: use autoexec.cfg to keep the log file as small as possible',
        text: 'The tracker reads one kind of line and Dota writes everything. A measured two-and-a-half-hour session came to 12 MB, of which 0.08 MB was the tracker’s — most of the rest was a single engine warning repeating five times a second. This file tells Dota to keep those channels on screen and out of the log. Nothing you see in-game changes, and deleting the file undoes all of it.',
        cfgLabel: 'Save it here, inside your Steam folder',
        cfgPath: 'steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\autoexec.cfg',
        caveat: 'Channel names change between Dota patches, and a line naming one that no longer exists simply fails at startup — that channel keeps logging and nothing else breaks. To build a list for your own client instead, run log_dumpchannels in the console; the tracker’s SETUP.md walks through it.',
        instead: 'Skipping this costs you nothing but disk. Start the tracker before Dota and it trims the log on the way up — the one moment the file is not locked, because once the game has it open nothing else may rewrite it.',
      },
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
  copy: {
    label: 'Копировать',
    done: 'Скопировано',
    failed: 'Не удалось скопировать — выделите текст и скопируйте вручную',
  },
  skipToContent: 'Перейти к содержимому',
  theme: 'Переключить тему',
  language: 'Язык',

  nav: {
    home: 'Главная',
    planner: 'Сборки',
    tracker: 'Трекер',
    source: 'GitHub',
  },

  auth: {
    signIn: 'Войти через Steam',
    signInWhy: 'Нужен только чтобы опубликовать гайд, оставить комментарий или голос. Планировщик работает без аккаунта.',
    signOut: 'Выйти',
    account: 'Аккаунт',
    myBuilds: 'Мои гайды',
    buildCount: '{n} из {max}',
    signInFailed: 'Steam не подтвердил вход. Попробуйте ещё раз.',
    signInExpired: 'Вход занял слишком много времени. Попробуйте ещё раз.',
  },

  builds: {
    title: 'Сборки',
    lead: 'Сборки, которые опубликовали игроки, вместе с доской, по которой они играли.',

    navNew: 'Новая сборка',
    navMine: 'Мои сборки',

    empty: 'Сборок пока нет. Первая может быть вашей.',
    emptySearch: 'Ничего не нашлось.',
    searchLabel: 'Поиск сборок',
    searchPlaceholder: 'Название или описание',
    sort: { new: 'Новые', top: 'С лучшей оценкой', discussed: 'Больше обсуждают' },
    anyHero: 'Любой герой',
    more: 'Показать ещё',
    loading: 'Загрузка',
    failed: 'Что-то пошло не так.',
    retry: 'Попробовать снова',

    by: 'автор',
    deleted: 'Эта сборка удалена.',
    notFound: 'По этой ссылке сборки нет.',
    backToBuilds: 'Ко всем сборкам',
    draft: 'Черновик',
    commentsTitle: 'Комментарии',
    commentPlaceholder: 'Что сработало, что бы вы поменяли.',
    postComment: 'Отправить',
    selfVote: 'Нельзя голосовать за свою сборку.',

    publish: 'Сохранить как сборку',
    publishTitle: 'Сохранить сборку',
    publishLead: 'У неё появится своя ссылка и она попадёт в поиск. Потом её можно изменить или удалить.',
    fieldTitle: 'Название',
    fieldTitlePlaceholder: 'Лес за Акса',
    fieldBody: 'Заметки',
    fieldBodyPlaceholder: 'Когда что покупать, что пропустить — всё, чего доска сказать не может.',
    saveDraft: 'Сохранить черновик',
    publishAction: 'Опубликовать',
    cancel: 'Отмена',
    published: 'Сохранено',
    publishedLead: 'Любой, у кого есть ссылка, сможет прочитать.',
    limitReached: 'У вас уже пять сборок. Удалите одну, чтобы освободить место.',
    signInToPublish: 'Войдите через Steam, чтобы сохранить сборку. Ссылка выше работает и без аккаунта.',

    saveChanges: 'Сохранить изменения',
    saved: 'Сохранено',
    saveAsMine: 'Сохранить себе',
    saveAsMineWhy: 'Копирует эту доску в ваши сборки как черновик. Оригинал не меняется.',
    signInToSave: 'Войдите через Steam, чтобы сохранить изменения. Редактировать можно и так.',

    mineTitle: 'Мои сборки',
    mineLead: 'Пять слотов. Удаление сразу освобождает слот.',
    mineEmpty: 'Пока ничего не сохранено. Соберите доску и сохраните её оттуда.',
    slotsUsed: 'Занято {n} из {max}',
    unpublish: 'В черновики',
    delete: 'Удалить',
    deleteConfirm: 'Удалить сборку? Ссылка перестанет работать у всех.',
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
      lead: 'Трекер следит за игрой, читая лог-файл, который Dota умеет писать по ходу дела. Создайте файл, укажите его игре, потом трекеру — путь везде один и тот же.',
      logPath: 'C:\\Users\\Public\\aow5-console.log',
      launchOption: '-con_logfile C:\\Users\\Public\\aow5-console.log',
      pathWarning: 'Путь — только латинскими буквами, расширение — .log. Если папка названа по-русски — а именно такова ваша папка пользователя, если русское имя учётной записи — Dota не напишет ничего и ничего не скажет: игра запустится как обычно, а файл останется пустым — выглядит это ровно как сломанная сборка. C:\\Users\\Public предложен выше потому, что пишется одинаково на любой Windows, не требует прав и снимает вопрос целиком.',
      labels: {
        file: 'Файл — создайте его первым',
        option: 'Параметр запуска — тот же путь после -con_logfile',
      },
      alert: {
        title: 'Без этого параметра запуска трекер ничего не увидит',
        text: 'Без него игра ничего не пишет, оверлей читает пустой файл, а все числа остаются нулёвыми — выглядит это ровно как сломанная сборка. В обеих строках должен быть один и тот же путь — тот самый файл из первого шага.',
      },
      steps: [
        'Создайте файл сами. Откройте C:\\Users\\Public, правая кнопка → Создать → Текстовый документ и переименуйте в aow5-console.log — вместе с расширением, для чего в Проводнике может понадобиться включить Вид → Расширения имён файлов. Сначала файл нужен ради третьего шага: трекер открывает диалог выбора, а выбрать в нём несуществующий файл нельзя.',
        'В Steam правой кнопкой по Dota 2 → Свойства → Параметры запуска и вставьте строку выше — со своим путём, если выбрали другое место.',
        'Запустите трекер, нажмите Ctrl+Alt+T, чтобы по нему можно было кликать, откройте Настройки → Консольный лог → Выбрать и укажите созданный файл.',
        'Играйте в оконном или безрамочном режиме — полноэкранный закрывает любой оверлей, включая этот.',
      ],
      note: 'Dota пишет в этот файл всю консоль, так что он быстро растёт. Трекер умеет держать его маленьким: в тех же настройках есть переключатель и кнопка «Обрезать сейчас».',

      tuning: {
        title: 'Необязательно: autoexec.cfg, чтобы лог оставался как можно меньше',
        text: 'Трекер читает один вид строк, а Dota пишет всё. За сессию в два с половиной часа набралось 12 МБ, из них 0,08 МБ — строки трекера; остальное по большей части — одно предупреждение движка, повторяющееся пять раз в секунду. Этот файл оставляет такие каналы в консоли, но не пускает в лог. В игре ничего не меняется, а удаление файла всё отменяет.',
        cfgLabel: 'Сохраните сюда, внутри папки Steam',
        cfgPath: 'steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\autoexec.cfg',
        caveat: 'Имена каналов меняются от патча к патчу, и строка с несуществующим именем просто не сработает при запуске — этот канал продолжит писать, больше ничего не сломается. Чтобы собрать список под свой клиент, выполните log_dumpchannels в консоли — в SETUP.md трекера разобрано по шагам.',
        instead: 'Пропустить это можно — цена только место на диске. Запускайте трекер до Dota: он обрежет лог на старте — в единственный момент, когда файл не занят: пока игра держит его открытым, перезаписать его нельзя.',
      },
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
