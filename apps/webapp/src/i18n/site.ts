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
   * Sign-in prompts live in the header and nowhere else. A control that only
   * exists to ask for an account reads as a demand on a tool that has never
   * needed one, so the pages themselves simply show less when signed out.
   */
  auth: {
    signIn: string;
    signUp: string;
    signInWhy: string;
    signOut: string;
    account: string;
    myBuilds: string;
    /** "{n} of {max}" — the author's five slots. */
    buildCount: string;

    /** The dialog. */
    dialogTitleSignIn: string;
    dialogTitleSignUp: string;
    dialogLeadSignIn: string;
    dialogLeadSignUp: string;
    nickname: string;
    nicknameHint: string;
    password: string;
    passwordHint: string;
    /** The whole recovery story, and it has to be said before somebody commits. */
    noRecovery: string;
    switchToSignUp: string;
    switchToSignIn: string;
    /** Shown while the browser is solving the sign-up challenge. */
    solving: string;
    working: string;

    /** One line per `ApiErrorCode` the form can provoke. */
    errorCredentials: string;
    errorTaken: string;
    errorCaptcha: string;
    errorRateLimited: string;
    errorBanned: string;
    errorNickname: string;
    errorPassword: string;
    errorGeneric: string;
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
    /** Another page of *comments*. The build list pages instead — see below. */
    more: string;
    /**
     * Paging the build list: a stack rather than page numbers, because a
     * keyset cursor cannot count pages it has not walked to.
     */
    previousPage: string;
    nextPage: string;
    pageNumber: (n: number) => string;
    loading: string;
    failed: string;
    retry: string;

    by: string;
    /** A build that its author removed. */
    deleted: string;
    /** A *comment* that was removed. The row stays so the thread keeps its shape. */
    commentDeleted: string;
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

    /** Editing a build that is already saved. Author only. */
    saveChanges: string;
    saved: string;

    /** The author's own five. */
    mineTitle: string;
    mineLead: string;
    /** Shown at /me when nobody is signed in. Points at the header rather than nagging. */
    mineSignedOut: string;
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
       * Step one: quieten Dota's logging at the source.
       *
       * This used to be the optional one, on the grounds that the tracker trims
       * the log itself and so works either way. It reads as step one now: a
       * measured evening writes 12 MB of which the tracker's share is 0.08, and
       * trimming after the fact is a worse deal than never writing it. So it
       * sits inside the same alert as the launch option, under that alert's
       * heading — there is no `title` here because a second heading for one
       * required step reads as a second step.
       *
       * `cfgPath` is relative to the Steam folder rather than absolute: unlike
       * the log, this file's location is not the reader's choice, and the only
       * part that varies is where Steam itself lives.
       */
      tuning: {
        text: string;
        cfgPath: string;
        cfgLabel: string;
        /** The caveat that stops a stale channel list being read as a failure. */
        caveat: string;
        /** The tracker's own trimming, as the backstop rather than the alternative. */
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
    signIn: 'Sign in',
    signUp: 'Create an account',
    signInWhy: 'Only needed to publish a build, comment or vote. The planner works without an account.',
    signOut: 'Sign out',
    account: 'Account',
    myBuilds: 'My builds',
    buildCount: '{n} of {max}',

    dialogTitleSignIn: 'Sign in',
    dialogTitleSignUp: 'Create an account',
    dialogLeadSignIn: 'Your builds, comments and votes are kept under your nickname.',
    dialogLeadSignUp: 'A nickname and a password. Nothing else, and no email address.',
    nickname: 'Nickname',
    nicknameHint: '3–24 characters. Letters, digits, - and _. Latin or Cyrillic, not both.',
    password: 'Password',
    passwordHint: 'At least 8 characters. Length is the only rule.',
    noRecovery: 'There is no way to reset a forgotten password — there is no email address to send one to. Write it down somewhere safe.',
    switchToSignUp: 'No account yet? Create one',
    switchToSignIn: 'Already have an account? Sign in',
    solving: 'Checking your browser…',
    working: 'One moment…',

    errorCredentials: 'Wrong nickname or password.',
    errorTaken: 'That nickname is taken.',
    errorCaptcha: 'That check expired. Please try again.',
    errorRateLimited: 'Too many attempts. Please wait a little and try again.',
    errorBanned: 'That account has been suspended.',
    errorNickname: 'That nickname will not work — see the note under the field.',
    errorPassword: 'That password is too short or too long.',
    errorGeneric: 'That did not work. Please try again.',
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
    previousPage: 'Previous',
    nextPage: 'Next',
    pageNumber: (n) => `Page ${n}`,
    loading: 'Loading',
    failed: 'Something went wrong.',
    retry: 'Try again',

    by: 'by',
    deleted: 'This build was deleted.',
    commentDeleted: 'This comment was deleted.',
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

    saveChanges: 'Save changes',
    saved: 'Saved',

    mineTitle: 'My builds',
    mineLead: 'Five slots. Deleting one frees it immediately.',
    mineSignedOut: 'Sign in from the header to see the builds you have saved.',
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
        file: 'The file — the one step two makes',
        option: 'The launch option — same path, after -con_logfile',
      },
      alert: {
        title: 'Dota needs one launch option, or the tracker sees nothing',
        text: 'Without it the game writes nothing, the overlay reads an empty file, and every number stays at zero — which looks exactly like a broken download. Both boxes must end in the same path, and it must be the file you made in step two.',
      },
      steps: [
        'Save the autoexec.cfg from the box above into your Dota folder, at the path given with it. Dota writes its entire console to the log, and most of what arrives is one engine warning repeating five times a second — without this the file grows by megabytes an hour around the handful of lines the tracker actually reads. Nothing on screen changes, and deleting the file undoes it.',
        'Make the file yourself. Open C:\\Users\\Public, right-click → New → Text Document, and rename it to aow5-console.log — including the ending, which means turning on View → File name extensions in Explorer if you have not. Making it early is what lets you pick it in step four: the tracker opens a file dialog, and a dialog cannot select a file that does not exist yet.',
        'In Steam, right-click Dota 2 → Properties → Launch Options, and paste the launch option above — with your path, if you chose a different one.',
        'Start the tracker, press Ctrl+Alt+T so you can click it, then open Settings → Console log → Choose, and pick the file you made.',
        'Play windowed or borderless — fullscreen covers every overlay, this one included.',
      ],
      note: 'Dota writes its whole console to that file, so it grows quickly. The tracker can keep it small for you: there is a switch for it, and a “Trim now” button, in the same settings.',

      tuning: {
        text: 'The tracker reads one kind of line and Dota writes everything. A measured two-and-a-half-hour session came to 12 MB, of which 0.08 MB was the tracker’s — most of the rest was a single engine warning repeating five times a second. This file tells Dota to keep those channels on screen and out of the log. Nothing you see in-game changes, and deleting the file undoes all of it.',
        cfgLabel: 'Save it here, inside your Steam folder',
        cfgPath: 'steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\autoexec.cfg',
        caveat: 'Channel names change between Dota patches, and a line naming one that no longer exists simply fails at startup — that channel keeps logging and nothing else breaks. To build a list for your own client instead, run log_dumpchannels in the console; the tracker’s SETUP.md walks through it.',
        instead: 'The tracker trims the log as well, on its own: start it before Dota and it cuts the file down on the way up — the one moment the file is not locked, because once the game has it open nothing else may rewrite it. That is a backstop for what still gets through, not a way around this file.',
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
    signIn: 'Войти',
    signUp: 'Создать аккаунт',
    signInWhy: 'Нужен только чтобы опубликовать гайд, оставить комментарий или голос. Планировщик работает без аккаунта.',
    signOut: 'Выйти',
    account: 'Аккаунт',
    myBuilds: 'Мои гайды',
    buildCount: '{n} из {max}',

    dialogTitleSignIn: 'Вход',
    dialogTitleSignUp: 'Создание аккаунта',
    dialogLeadSignIn: 'Ваши гайды, комментарии и голоса хранятся под вашим ником.',
    dialogLeadSignUp: 'Ник и пароль. Больше ничего, и никакой почты.',
    nickname: 'Ник',
    nicknameHint: 'От 3 до 24 символов. Буквы, цифры, - и _. Латиница или кириллица, но не вместе.',
    password: 'Пароль',
    passwordHint: 'Не меньше 8 символов. Других требований нет.',
    noRecovery: 'Забытый пароль восстановить нельзя — почты, на которую можно было бы прислать ссылку, здесь нет. Запишите его в надёжном месте.',
    switchToSignUp: 'Нет аккаунта? Создайте',
    switchToSignIn: 'Уже есть аккаунт? Войдите',
    solving: 'Проверяем браузер…',
    working: 'Секунду…',

    errorCredentials: 'Неверный ник или пароль.',
    errorTaken: 'Этот ник уже занят.',
    errorCaptcha: 'Проверка устарела. Попробуйте ещё раз.',
    errorRateLimited: 'Слишком много попыток. Подождите немного и попробуйте снова.',
    errorBanned: 'Этот аккаунт заблокирован.',
    errorNickname: 'Такой ник не подойдёт — смотрите подсказку под полем.',
    errorPassword: 'Пароль слишком короткий или слишком длинный.',
    errorGeneric: 'Не получилось. Попробуйте ещё раз.',
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
    previousPage: 'Назад',
    nextPage: 'Вперёд',
    pageNumber: (n) => `Страница ${n}`,
    loading: 'Загрузка',
    failed: 'Что-то пошло не так.',
    retry: 'Попробовать снова',

    by: 'автор',
    deleted: 'Эта сборка удалена.',
    commentDeleted: 'Этот комментарий удалён.',
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

    saveChanges: 'Сохранить изменения',
    saved: 'Сохранено',

    mineTitle: 'Мои сборки',
    mineLead: 'Пять слотов. Удаление сразу освобождает слот.',
    mineSignedOut: 'Войдите через шапку сайта, чтобы увидеть сохранённые сборки.',
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
        file: 'Файл — тот, что создаётся на втором шаге',
        option: 'Параметр запуска — тот же путь после -con_logfile',
      },
      alert: {
        title: 'Без этого параметра запуска трекер ничего не увидит',
        text: 'Без него игра ничего не пишет, оверлей читает пустой файл, а все числа остаются нулёвыми — выглядит это ровно как сломанная сборка. В обеих строках должен быть один и тот же путь — тот самый файл из второго шага.',
      },
      steps: [
        'Сохраните autoexec.cfg из блока выше в папку Dota — путь указан рядом с ним. Dota пишет в лог всю консоль, и большая часть попадающего туда — одно предупреждение движка, повторяющееся пять раз в секунду: без этого файла лог растёт на мегабайты в час вокруг тех немногих строк, которые трекеру и нужны. На экране ничего не меняется, а удаление файла всё отменяет.',
        'Создайте файл сами. Откройте C:\\Users\\Public, правая кнопка → Создать → Текстовый документ и переименуйте в aow5-console.log — вместе с расширением, для чего в Проводнике может понадобиться включить Вид → Расширения имён файлов. Файл нужен заранее ради четвёртого шага: трекер открывает диалог выбора, а выбрать в нём несуществующий файл нельзя.',
        'В Steam правой кнопкой по Dota 2 → Свойства → Параметры запуска и вставьте строку выше — со своим путём, если выбрали другое место.',
        'Запустите трекер, нажмите Ctrl+Alt+T, чтобы по нему можно было кликать, откройте Настройки → Консольный лог → Выбрать и укажите созданный файл.',
        'Играйте в оконном или безрамочном режиме — полноэкранный закрывает любой оверлей, включая этот.',
      ],
      note: 'Dota пишет в этот файл всю консоль, так что он быстро растёт. Трекер умеет держать его маленьким: в тех же настройках есть переключатель и кнопка «Обрезать сейчас».',

      tuning: {
        text: 'Трекер читает один вид строк, а Dota пишет всё. За сессию в два с половиной часа набралось 12 МБ, из них 0,08 МБ — строки трекера; остальное по большей части — одно предупреждение движка, повторяющееся пять раз в секунду. Этот файл оставляет такие каналы в консоли, но не пускает в лог. В игре ничего не меняется, а удаление файла всё отменяет.',
        cfgLabel: 'Сохраните сюда, внутри папки Steam',
        cfgPath: 'steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\autoexec.cfg',
        caveat: 'Имена каналов меняются от патча к патчу, и строка с несуществующим именем просто не сработает при запуске — этот канал продолжит писать, больше ничего не сломается. Чтобы собрать список под свой клиент, выполните log_dumpchannels в консоли — в SETUP.md трекера разобрано по шагам.',
        instead: 'Трекер и сам обрезает лог: запускайте его до Dota — он подрежет файл на старте, в единственный момент, когда файл не занят, ведь пока игра держит его открытым, перезаписать его нельзя. Это подстраховка для того, что всё же просочилось, а не замена этому файлу.',
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

const zh: SiteStrings = {
  brand: 'AOW5 utils',
  copy: {
    label: '复制',
    done: '已复制',
    failed: '复制失败 — 请手动选中文本复制',
  },
  skipToContent: '跳到正文',
  theme: '切换主题',
  language: '语言',

  nav: {
    home: '首页',
    planner: '配装',
    tracker: '刷图统计',
    source: 'GitHub',
  },

  auth: {
    signIn: '登录',
    signUp: '注册账号',
    signInWhy: '只有发布配装、评论和投票才需要账号。规划器本身不用登录也能用。',
    signOut: '退出登录',
    account: '账号',
    myBuilds: '我的配装',
    buildCount: '{n} / {max}',

    dialogTitleSignIn: '登录',
    dialogTitleSignUp: '注册账号',
    dialogLeadSignIn: '你的配装、评论和投票都记在你的昵称下。',
    dialogLeadSignUp: '一个昵称，一个密码。没有别的，也不要邮箱。',
    nickname: '昵称',
    nicknameHint: '3–24 个字符。字母、数字、- 和 _。拉丁字母或西里尔字母，不能混用。',
    password: '密码',
    passwordHint: '至少 8 个字符。除了长度没有别的要求。',
    noRecovery: '密码忘了就找不回来 — 没有邮箱可以给你发重置链接。请找个安全的地方记下来。',
    switchToSignUp: '还没有账号？注册一个',
    switchToSignIn: '已经有账号了？去登录',
    solving: '正在检查你的浏览器…',
    working: '请稍候…',

    errorCredentials: '昵称或密码不对。',
    errorTaken: '这个昵称已经有人用了。',
    errorCaptcha: '这次校验已过期，请重试。',
    errorRateLimited: '尝试次数太多，请稍等一会儿再试。',
    errorBanned: '这个账号已被封禁。',
    errorNickname: '这个昵称不行 — 见输入框下方的说明。',
    errorPassword: '密码太短或太长。',
    errorGeneric: '没成功，请再试一次。',
  },

  builds: {
    title: '配装',
    lead: '玩家发布的配装，附带他们实际用过的面板。',

    navNew: '新建配装',
    navMine: '我的配装',

    empty: '还没有人发布配装。第一个可以是你的。',
    emptySearch: '没有匹配的结果。',
    searchLabel: '搜索配装',
    searchPlaceholder: '标题或简介',
    sort: { new: '最新', top: '评分最高', discussed: '讨论最多' },
    anyHero: '所有英雄',
    more: '加载更多',
    previousPage: '上一页',
    nextPage: '下一页',
    pageNumber: (n) => `第 ${n} 页`,
    loading: '加载中',
    failed: '出了点问题。',
    retry: '重试',

    by: '作者',
    deleted: '这套配装已被删除。',
    commentDeleted: '这条评论已被删除。',
    notFound: '这个链接下没有配装。',
    backToBuilds: '返回配装列表',
    draft: '草稿',
    commentsTitle: '评论',
    commentPlaceholder: '哪里好用，哪里你会改。',
    postComment: '发表',
    selfVote: '不能给自己的配装投票。',

    publish: '保存为配装',
    publishTitle: '保存这套配装',
    publishLead: '它会有自己的链接，并出现在搜索里。之后你随时可以编辑或删除。',
    fieldTitle: '标题',
    fieldTitlePlaceholder: '斧王打野路线',
    fieldBody: '说明',
    fieldBodyPlaceholder: '什么时候买什么、什么可以跳过，以及面板说不出来的东西。',
    saveDraft: '存为草稿',
    publishAction: '发布',
    cancel: '取消',
    published: '已保存',
    publishedLead: '拿到这条链接的人都能看。',
    limitReached: '你已经有五套配装了。删掉一套才能腾出位置。',

    saveChanges: '保存修改',
    saved: '已保存',

    mineTitle: '我的配装',
    mineLead: '五个位置。删掉一套就立刻空出来。',
    mineSignedOut: '从页首登录，即可看到你保存过的配装。',
    mineEmpty: '还没有保存过东西。先摆一个面板，再从那里保存。',
    slotsUsed: '已用 {n} / {max} 个位置',
    unpublish: '转为草稿',
    delete: '删除',
    deleteConfirm: '删除这套配装？所有人的链接都会失效。',
  },

  landing: {
    title: '两个为 Age of Weapons 5 做的工具。',

    planner: {
      kicker: '就在这个标签页里',
      title: '配装规划器',
      lead: '先选这套配装针对的英雄，再把配装按分段摆出来 — 从一段起，最多九段。整套东西都装在链接里，分享配装就是发一个网址。不用注册，也不用安装。',
      features: [
        '每个格子只收该放的东西 — 药剂格永远不会给你列出护甲。',
        '技能也算在内：在争同一个按键的技能之间做选择，只有一个候选的按键会自动填好。',
        '最多九个分段，每段有自己的名字和备注 — 前期、成型之后、后期。',
        '每件物品的属性、由什么合成、又能合成什么，支持英文、俄文和中文。',
        '推荐码会跟着你分享的链接一起走，并且不会覆盖打开链接的人自己的码。',
      ],
      cta: '打开规划器',
      note: '配装就是那条链接。什么都不会上传，服务器上也不留东西。',
    },

    tracker: {
      kicker: '需要单独下载',
      title: '刷图统计',
      lead: '一个刷图时浮在游戏上面的面板：这一晚每小时挣多少、这一间打了多久、整晚里有多少时间真的在刷 — 外加所有掉落和它们值多少钱。',
      features: [
        '玩的时候鼠标直接穿过它。想改点什么，按一个热键就行。',
        '可以收成三个数字：本轮、每小时金钱，以及你实际刷了多久。',
        '每件掉落都列出来并计价，商人的抽成已经扣掉 — 游戏估错价的东西，你可以自己定价。',
        '过往场次的历史记录，还有你正在攒的东西的材料清单。',
        '只读你自己的日志文件。不碰游戏文件，不代打，也不把任何东西发到外面。',
      ],
      cta: '了解刷图统计',
      note: 'Windows。请用窗口或无边框模式：全屏会盖住所有浮层。',
    },
  },

  tracker: {
    kicker: '适用于 Windows',
    title: '刷图统计',
    lead: '一个刷图时浮在 Dota 上面的面板，回答两个问题：这间房值不值得打，以及今晚整体如何。玩的时候看三个数字，想看细账时再展开完整的掉落列表。',

    windows: {
      title: '它会在屏幕上放什么',
      lead: '几块面板，每块都是浮在游戏上的独立窗口。留下你要的那几块；每块都记得你把它放在哪。',
      items: [
        {
          name: '刷图面板',
          text: '一开始很小：你在哪、打了几轮，以及三个数字 — 本轮、每小时金钱，还有这一场里真正花在房间里的比例。展开后是全部掉落，随你排序，逐件计价也按整叠计价。',
        },
        {
          name: '历史',
          text: '过往场次，最新的在前，里面还有每一轮。全部按今天的价格计价，所以以前的一晚值多少，是它现在值多少。',
        },
        {
          name: '设置',
          text: '你自己的物品价格、想盯着的物品、透明度和缩放，以及要跟踪哪个日志文件。',
        },
        {
          name: '配方',
          text: '你正在攒的东西的材料条，不用退出游戏就能看到还缺什么。',
        },
      ],
    },

    fitting: {
      title: '把它调到合适的大小',
      lead: '浮层只有在合适的大小和透明度下才好用 — 所以两者都能调，而且都会记住。',
      items: [
        {
          name: '收起',
          text: '把面板收成一行，窗口也跟着缩小，不会留一块看不见的东西压在游戏上。',
        },
        { name: '调整大小', text: '拖角或拖边，拖到你要的尺寸。' },
        {
          name: '缩放',
          text: '滑杆从 60% 到 160% — 或者 Ctrl+Alt 加 + / − / 0，玩的时候也能用。',
        },
        {
          name: '透明度',
          text: '默认关着，之后随时可调。只有数字后面的底板会变淡，数字本身仍然清楚。',
        },
      ],
    },

    setup: {
      title: '怎么装起来',
      lead: '统计工具是靠读 Dota 在你玩的时候写的日志文件来跟上进度的。先建好文件，再让游戏指向它，最后让统计工具指向它 — 三次都是同一个路径。',
      logPath: 'C:\\Users\\Public\\aow5-console.log',
      launchOption: '-con_logfile C:\\Users\\Public\\aow5-console.log',
      pathWarning:
        '路径请用纯英文字母，并保留 .log 结尾。如果文件夹名带非拉丁字符 — 你的用户文件夹就可能是这样 — Dota 会什么都不写，而且不会报错：游戏照常运行，文件却始终是空的，看起来就像下载坏了。上面推荐 C:\\Users\\Public，是因为它在每台 Windows 上写法都一样、不需要权限，也彻底绕开了这个问题。',
      labels: {
        file: '这个文件 — 第二步要建的那个',
        option: '启动项 — 同一个路径，跟在 -con_logfile 后面',
      },
      alert: {
        title: 'Dota 需要一个启动项，否则统计工具什么都看不到',
        text: '没有它，游戏什么都不写，浮层读到的是空文件，所有数字都停在零 — 看起来就跟下载坏了一模一样。两个框里必须是同一个路径，而且必须是第二步建的那个文件。',
      },
      steps: [
        '把上面那份 autoexec.cfg 按给出的路径存进你的 Dota 目录。Dota 会把整个控制台都写进日志，而其中大部分是同一条引擎警告每秒重复五次 — 不加这个，文件会以每小时若干兆的速度膨胀，而统计工具真正要读的只有寥寥几行。游戏画面不会有任何变化，删掉这个文件就能还原。',
        '自己把文件建出来。打开 C:\\Users\\Public，右键 → 新建 → 文本文档，然后改名为 aow5-console.log — 包括后缀，这意味着如果你还没开，就要在资源管理器里打开“查看 → 文件扩展名”。提前建好，第四步才选得到它：统计工具打开的是文件对话框，而对话框选不了还不存在的文件。',
        '在 Steam 里右键 Dota 2 → 属性 → 启动选项，把上面的启动项粘进去 — 如果你换了路径，就用你自己的。',
        '启动统计工具，按 Ctrl+Alt+T 让它能被点到，然后打开 设置 → 控制台日志 → 选择，挑中你建的那个文件。',
        '请用窗口或无边框模式玩 — 全屏会盖住所有浮层，这个也不例外。',
      ],
      note: 'Dota 会把整个控制台写进那个文件，所以它长得很快。统计工具可以替你把它压小：同一个设置页里有一个开关，还有一个“立即清理”按钮。',

      tuning: {
        text: '统计工具只读一种行，而 Dota 什么都写。实测两个半小时的一场下来是 12 MB，其中属于统计工具的只有 0.08 MB — 剩下的大半是同一条引擎警告每秒重复五次。这个文件让 Dota 把那些频道留在屏幕上、挡在日志外。游戏里看到的东西不会变，删掉文件就全部还原。',
        cfgLabel: '存在这里，也就是你的 Steam 目录里',
        cfgPath: 'steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\autoexec.cfg',
        caveat:
          '频道名会随 Dota 版本变动，写到一个已经不存在的频道时，那一行在启动时直接失败 — 该频道照常记日志，别的什么都不受影响。想给自己的客户端列一份清单，就在控制台里跑 log_dumpchannels；统计工具的 SETUP.md 里有完整说明。',
        instead:
          '统计工具自己也会清理日志：先启动它再开 Dota，它会在启动过程中把文件裁小 — 那是文件唯一没被占用的时刻，因为游戏一旦打开它，别的程序就不能再重写。那是给漏网之鱼兜底的，不是这个文件的替代品。',
      },
    },

    pricing: {
      title: '金钱数字是怎么来的',
      text: 'Age of Weapons 5 有自己的一套经济系统，并且不会把你的金钱报给游戏之外的任何东西，所以统计工具改为给你捡到的东西计价，用的是游戏自己的物品价值。商人只付一半，所以默认也按一半算 — 凡是你觉得游戏估高或估低了的，都可以自己定价。',
    },

    privacy: {
      title: '它碰什么，不碰什么',
      text: '它只读一样东西：Dota 在你自己电脑上写的那个日志文件。不改游戏文件，不读游戏内存，不替你操作，也不会把任何东西发给 Valve、模组作者或别的什么地方。它唯一会下载的是物品图标，你的设置只留在你自己的机器上。',
    },
  },

  preview: {
    plannerCaption: '规划器画出来的一段配装。',
    trackerCaption: '浮层展开与收起的样子。',
    section: '前期',
    spells: '技能',
    potions: '药剂',
    equipment: '装备',
    runes: '符印',
    neutral: '中立',
    backpack: '背包',
    at: '位置',
    inHideout: '在营地',
    runs: '轮',
    run: '轮',
    goldPerHour: '金/时',
    session: '本场',
    room: '倾天之境',
    colItem: '物品',
    colValue: '单价',
    colTotal: '合计',
    hotkeyHint: 'Ctrl+Alt+T 可交互',
    collapsed: '已收起',
    expanded: '已展开',
  },

  download: {
    checking: '正在查找最新版本…',
    label: '下载 Windows 版',
    version: (tag) => `版本 ${tag}`,
    size: (mb) => `${mb} MB`,
    published: (date) => `发布于 ${date}`,
    allReleases: '全部版本',
    none: '尚未发布',
    noneHint: '第一个版本一出来，下载就会出现在这里。',
    error: '无法连接 GitHub',
    errorHint: '所有版本都列在下载页上。',
  },

  footer: {
    attribution:
      '为 Age of Weapons 5 自定义游戏做的玩家自制工具。与 Valve 无关，也未获其认可。Dota 2 及其物品美术归 Valve Corporation 所有；Age of Weapons 5 的数据与自制美术归模组作者所有，此处仅用于展示这个自定义游戏的相关信息。',
    workshop: 'Steam 创意工坊上的 Age of Weapons 5',
    source: 'GitHub',
    builtWith: '免费、开源。没有广告，没有统计追踪，不需要账号。',
  },
};

export const SITE: Record<Lang, SiteStrings> = { en, ru, zh };
