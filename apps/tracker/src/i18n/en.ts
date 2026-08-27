import type { CardId } from '@core/cards.ts';
import type { RunOutcome } from '@core/stats.ts';
import type { LogTrim, UpdateState } from '@core/ipc.ts';

/**
 * Every word the overlay says, in the language it was written in.
 *
 * English is the reference catalog: `Messages` is inferred from this object, so
 * a string added here is a compile error in `ru.ts` and `zh.ts` until it is
 * translated. That is the whole reason the catalogs are TypeScript rather than
 * JSON — a missing key in a JSON bundle is a blank label at runtime, and a
 * blank label on a HUD read at a glance over a game is indistinguishable from a
 * broken tracker.
 *
 * Nested by where it is said rather than flattened into dotted keys, because
 * the shape is then checked as a whole: a translator who misspells a group name
 * is told so, where a flat map would simply carry an unused key and a missing
 * one.
 *
 * Anything with a number or a name in it is a function, not a template with
 * placeholders substituted at call time. Word order differs between these three
 * languages — Russian inflects the noun after the count, Chinese wants a
 * measure word between them — and a function lets each catalog write its own
 * sentence instead of filling in someone else's.
 *
 * What is *not* here: item names, room names and ability text. Those come from
 * the game's own tables in `aow5-shared`, keyed by the same locale — see
 * `features/items/table.ts`.
 */
export const en = {
  /** Said in more than one window. */
  common: {
    cancel: 'Cancel',
    close: 'Close this window',
    refresh: 'Refresh',
    choose: 'Choose',
    notSet: 'Not set',
    /** The placeholder for a number that does not exist yet. */
    none: '—',
  },

  /** The window titles, which are all `AOW5` and then what this one is. */
  window: {
    brand: 'AOW5',
    farm: 'tracker',
    settings: 'settings',
    history: 'history',
  },

  shell: {
    expand: 'Expand to the full readout',
    collapse: 'Collapse to the summary cards',
    /** While the panel is clickable: how to hand the mouse back to the game. */
    pinHint: (hotkey: string) => `${hotkey} to unfocus and pin it over the game`,
    /** While it is click-through: how to reach it. */
    configureHint: (hotkey: string) => `${hotkey} to configure`,
  },

  farm: {
    startClock: 'Start the session clock',
    pauseClock: 'Pause the session clock — loot still counts',
    restart: 'Start a new session — the numbers go back to zero',
    undoDeath: 'Undo — count the last room again',
    markDeath: 'Died here — drop this room’s loot from the session, keep the time',
    history: 'History',
    settings: 'Settings',
    quit: 'Quit the tracker',
  },

  stateLine: {
    /*
     * "In hideout" but "At Frozen Tundra": the hideout is a place you are
     * inside of, and a room is a place you are at, which is also the difference
     * between waiting and farming. A language that does not draw that
     * distinction says the same word twice here, which is the right answer for
     * it — the pair exists so each catalog may differ, not so each must.
     */
    inHideout: 'In ',
    atRoom: 'At ',
    hideout: 'hideout',
    runs: 'Runs finished this session',
  },

  hud: {
    /** The terse label under each card, read against the number above it. */
    cardLabel: {
      session: 'session time',
      sessionGold: 'session gold',
      sessionBest: 'session best',
      mapTime: 'current time',
      mapGold: 'current gold',
      mapGoldAverage: 'gold per map',
      mapTimeAverage: 'time per map',
      goldPerHour: 'hourly gold',
    } as Record<CardId, string>,
    /** The sentence on hover, which is where a card explains itself. */
    cardTitle: {
      session: 'Since this session started — the hideout and the loading screens count',
      sessionGold: 'Everything this session has dropped, priced the way the list is',
      sessionBest: 'The item worth most this session',
      mapTime: 'How long you have been in the room you are standing in',
      mapGold: 'What the room below has dropped, priced the way the list is',
      mapGoldAverage: 'Mean gold of the rooms you have finished this session — the open one does not count yet',
      mapTimeAverage: 'Mean time of the rooms you have finished this session',
      goldPerHour: 'Gold per hour, counting only the time you spent inside rooms',
    } as Record<CardId, string>,
    /** The best card once there is something in it: the item, then what it is. */
    bestTitle: (item: string) => `${item} — the session’s most valuable pile`,
    columns: {
      name: 'picked up',
      unit: 'val',
      total: 'total',
    },
    sortBy: (column: string) => `Sort by ${column}`,
    emptyTracked: 'None of your tracked items in this room yet.',
    empty: 'Nothing dropped in here yet.',
    customPrice: (table: number) => `Your price. Without it this would fetch ${table}g.`,
  },

  recipe: {
    add: 'Add a recipe or an item',
    /** Beside the plus while the panel is empty, so the button says what it adds. */
    addLabel: 'recipe',
    stopCrafting: (item: string) => `Do not craft ${item}`,
    stopCraftingHint: 'Stop making this — count it as a material instead',
    craftInstead: (item: string) => `Craft ${item} instead`,
    craftInsteadHint: 'Craft this instead — give it a line of its own',
    oneFewer: (item: string) => `One fewer ${item}`,
    oneFewerHint: 'One fewer',
    removeTarget: (item: string) => `Remove ${item}`,
    removeTargetHint: 'Remove',
    oneMore: (item: string) => `One more ${item}`,
    oneMoreHint: 'One more',
    tickHint: (item: string, have: number, need: number) => `${item} ${have}/${need} — click to tick off`,
    ingredient: (item: string, have: number, need: number) => `${item}, ${have} of ${need}`,
    picker: {
      recipes: 'recipes',
      anyItem: 'any item',
      searchRecipes: 'Search recipes…',
      searchItems: 'Search items…',
      loading: 'Loading recipes…',
      noRecipe: 'Nothing craftable by that name. Try “any item”.',
      noItem: 'No item by that name.',
    },
  },

  history: {
    reading: 'Reading the archive…',
    empty:
      'Nothing recorded yet. A session lands here once its first run finishes — the run you are in is still the overlay’s.',
    select: (when: string) => `Select the session of ${when}`,
    mock: 'mock',
    runCount: (runs: number) => `${runs} runs`,
    stats: {
      active: 'active',
      gold: 'gold',
      value: 'value',
      items: 'items',
    },
    noRuns: 'No runs.',
    sessionTotal: 'session total',
    itemCount: (items: number) => `${items} items`,
    nothingDropped: 'Nothing dropped.',
    deleteSelectedHint: 'Delete the ticked sessions and the runs recorded under them.',
    deleteAllHint: 'Delete every archived session. The session on screen keeps counting.',
    deleteSelected: (count: number) => `Delete ${count}`,
    confirmSelected: (count: number) => `Delete ${count}?`,
    deleteAll: 'Clear all',
    confirmAll: 'Delete all?',
    /*
      The pager, under the sessions.

      "Newer" and "Older" rather than "Previous" and "Next": the archive is in
      time order, newest first, so a reader knows which way they want to go
      before they know which direction that is on a list. Previous-page-of-a-
      list-of-evenings is a question nobody is asking.
    */
    newer: 'Newer',
    older: 'Older',
    page: (current: number, total: number) => `${current} / ${total}`,
    pageHint: (current: number, total: number) => `Page ${current} of ${total}`,
    /*
     * The badge on a run that did not simply end. `clear` is never drawn — a
     * run that went as expected has nothing to say about itself — but it is
     * here so the map is total and an outcome added later cannot fall through.
     */
    outcome: {
      open: 'open',
      clear: 'clear',
      chained: 'chained',
      abandoned: 'abandoned',
      other: 'other',
      died: 'died',
    } as Record<RunOutcome, string>,
  },

  settings: {
    prices: {
      title: 'Item prices',
      blurb:
        'The tables carry what an item sells for, which is not always what it is worth to you. Set your own and every gold figure follows it: g/hr, the session total, the loot list and the archive alike. Items you say nothing about keep the table price.',
      halve: 'Trader pays half',
      halveHint:
        'The trader buys at half the table price, so value every unpriced drop at half. Prices you set below are used exactly as you set them, either way.',
      search: 'Search an item to price…',
      /** The unpriced figure beside the field. "10k" + "g" reads as kilograms. */
      table: (gold: string) => `table ${gold}`,
      tableHint: 'What it would fetch without a price of its own',
      field: (item: string) => `Price for ${item}`,
      clear: (item: string) => `Remove your price for ${item}`,
      clearHint: 'Remove this price — back to the table price',
    },
    tracked: {
      title: 'Tracked items',
      blurb:
        'Pin the items you care about and the expanded readout lists only those, with a session total to match. With none pinned, everything picked up is listed. History always records the lot, whatever is pinned here.',
      search: 'Search by name…',
      untrack: (item: string) => `Stop tracking ${item}`,
      untrackHint: 'Stop tracking it',
    },
    shortcuts: {
      title: 'Shortcuts',
      blurb:
        'Keys the tracker answers to while the game has focus. The action key is the modifier they all hang off — change it once if its chords are spoken for, and every shortcut moves with it.',
      actionKey: 'Action key',
      /*
        Said plainly, because it is the reason the action key exists: the game
        binds bare letters, so a shortcut has to be a chord.
      */
      actionKeyHint: 'Held with every shortcut below, so none of them collides with a key the game already uses.',
      name: {
        focus: 'Focus the overlay',
        die: 'Mark the last room as a death',
      } as Record<string, string>,
      hint: {
        focus: 'Makes the panels clickable so you can drag, resize and configure them. Press it again to pin them back over the game.',
        die: 'The same as the skull in the title bar, without having to focus the overlay first — its loot stops counting toward the session, and the minutes still do.',
      } as Record<string, string>,
      /** The field is a key capture, not a text box, so it says what to do. */
      record: 'Press a key…',
      recordHint: 'Click, then press the key you want. Esc leaves it as it is.',
      rebind: (action: string) => `Change the key for: ${action}`,
      reset: 'Reset',
      resetHint: 'Back to the key this ships with',
      /** Two actions on one chord: the second never registers, silently. */
      clash: 'Two shortcuts on this key — only one of them will work.',
      /** A chord another application already owns. `register` fails quietly. */
      taken: 'Another application already has this key.',
    },
    sounds: {
      title: 'Sounds',
      enabled: 'Play a sound on drops',
      enabledHint:
        'Rings once per pickup that matches — a grade below, or an item you gave a sound of its own. Crimson Heart comes bound to the jackpot sound; unbind it and it stays unbound.',
      volume: 'Volume',
      limit: 'Cut long sounds',
      limitHint: 'Fade the sound out after a few seconds instead of playing the whole file.',
      limitAfter: 'Cut after',
      seconds: (value: number) => `${value}s`,
      /*
        The grid, before the per-item list, because it is the answer for almost
        everybody: what you react to is "something Mythic dropped", and binding
        that by name meant 239 rows.
      */
      rules: 'By grade',
      rulesHint:
        'A sound set on an item itself wins, then its rarity, then its level — and a drop rings once whatever else it matches.',
      byQuality: 'Rarity',
      byLevel: 'Level',
      /** The addon ships quality as a bare number; these are the names the planner gives the tiers. */
      rarity: {
        1: 'Common',
        2: 'Uncommon',
        3: 'Rare',
        4: 'Epic',
        5: 'Legendary',
        6: 'Mythic',
        7: 'Divine',
      } as Record<number, string>,
      level: (n: number) => `Lv ${n}`,
      rule: (grade: string) => `Sound for ${grade}`,
      builtins: 'In the box',
      /*
        The search panel, which is the one part of this window that leaves the
        machine. What it says out loud matters: where the results come from, and
        that most of them ask to be credited.
      */
      find: 'Find a sound',
      findHint:
        'Searches Freesound, a library of Creative Commons sounds. Adding one downloads it and keeps it with your settings, credit and licence included — then bind it to an item or a grade above. Most of the library asks only that the author is named.',
      findPlaceholder: 'coin, fanfare, boom…',
      by: (who: string) => `by ${who}`,
      add: (sound: string) => `Add ${sound}`,
      addHint: 'Add it and hear it',
      addFail: 'That sound could not be downloaded.',
      noHits: 'Nothing found. Try a plainer word.',
      searchFail: {
        off: 'Sound search is switched off in this config.',
        offline: 'Could not reach the search server.',
        unconfigured: 'This server has no sound library key.',
        busy: 'Too many searches just now. Try again shortly.',
        failed: 'The search did not come back with anything usable.',
      },
      /** Only shown once there is more here than a list you can read at a glance. */
      filter: 'Filter sounds…',
      noMatch: 'No sound by that name',
      choose: 'Choose a file…',
      remove: 'Clear',
      search: 'Search an item to bind a sound…',
      play: (sound: string) => `Play ${sound}`,
      playHint: 'Play it',
      pick: (item: string) => `Choose a sound for ${item}`,
      pickHint: 'Choose a file',
      unbind: (item: string) => `Unbind ${item}`,
      unbindHint: 'Unbind',
      /*
        The two settings that say *no*, under the grids they exist to make
        liveable. A tier rule is one click and 239 items; these are how it stays
        one click instead of becoming a decision to turn the feature off.
      */
      floor: 'Only ring above a price',
      floorHint:
        'A cheap drop stays silent whatever grade it is. Judged on what one is worth at your prices — not on the pile, so a big stack of something cheap is still cheap.',
      floorField: 'Least gold a drop must be worth',
      muted: 'Never ring for',
      mutedHint:
        'Items that stay silent whatever else would have rung them, their own sound included. Pick a rarity or a level to look through a tier, or search by name.',
      mutedAny: 'Any',
      mutedSearch: 'Search an item to mute…',
      mutedEmpty: 'Nothing muted yet.',
      /** The browse list is capped: 641 rows is not a list you read. */
      mutedMore: (n: number) => `${n} more — narrow it down`,
      mutedNone: 'No items in that grade.',
      mute: (item: string) => `Mute ${item}`,
      muteHint: 'Never ring for this',
      unmute: (item: string) => `Unmute ${item}`,
      unmuteHint: 'Let it ring again',
      /*
        The per-item list, which now leads the section. It used to sit under the
        grids on the argument that the grids answer for almost everybody — true,
        and it is also the reason this belongs on top: the grids are set once and
        left, and this is the part somebody comes back to.
      */
      perItem: 'By item',
      perItemHint: 'A sound on an item itself outranks both grids below.',
      /*
        A bound item that one of the two settings below has silenced.

        Worth a mark of its own, because it is the one place in this window
        where two things the player set disagree — the row says `jackpot` and
        the item is never going to make a sound. Without it the only way to find
        that out is to farm for an evening and wonder.
      */
      silencedMuted: 'Muted below — this will not ring',
      silencedFloor: 'Under the price floor — this will not ring',
    },
    session: {
      title: 'Session',
      autoResume: 'Start the clock on the first room',
      autoResumeHint:
        'A session begins paused, so the tracker can sit open while Dota loads without counting that as farming. With this on, walking into a room presses play for you. A pause you press mid-session still holds until the next room.',
    },
    cards: {
      title: 'HUD cards',
      blurb:
        'The stat cards on the farm overlay, drawn three to a row in the order below. Turning one off closes the space and the rest keep their order, so the row is always full from the left. The order itself is fixed: the rows are meant to be read as the session and the map.',
      /** Appended to the hint of the last card left on, which may not be turned off. */
      lastOne: (hint: string) => `${hint} The HUD needs one card; turn another on to free this one.`,
      /*
       * The full name and the sentence under it. Settings is read once with
       * attention, where the HUD is glanced at all evening — `gold/ses` is the
       * right label on a card two centimetres wide and tells a first-time
       * reader nothing.
       */
      name: {
        session: 'Session time',
        sessionGold: 'Session gold',
        sessionBest: 'Session best',
        mapTime: 'Current time',
        mapGold: 'Current gold',
        mapGoldAverage: 'Gold per map',
        mapTimeAverage: 'Time per map',
        goldPerHour: 'Hourly gold',
      } as Record<CardId, string>,
      hint: {
        session: 'Since the session started. The hideout and the loading screens count.',
        sessionGold: 'Everything this session has dropped, at your prices.',
        sessionBest: 'The single most valuable pile, said in its icon.',
        mapTime: 'How long you have been in the room you are standing in.',
        mapGold: 'What the room below has dropped, priced the way the list is.',
        mapGoldAverage: 'Mean gold of the rooms you have finished. The open one does not count until it does.',
        mapTimeAverage: 'Mean clear time of the rooms you have finished.',
        goldPerHour: 'Counting only the time spent inside rooms, not the hideout.',
      } as Record<CardId, string>,
    },
    language: {
      title: 'Language',
      blurb:
        'The overlay’s own words, and the item and room names with them — the tables carry all three, so nothing is left half-translated. Automatic follows Windows.',
      auto: 'Automatic',
      /*
       * Each language named in itself, which is the one label a reader who
       * cannot read the current one can still find.
       */
      en: 'English',
      ru: 'Русский',
      zh: '简体中文',
    },
    style: {
      title: 'Tracker style',
      blurb:
        'How the readout is arranged, not just how it is coloured. Minimalistic gives every stat the same card and lets you read the one you came for. Torchlight puts your best drop of the session across the top and demotes the rest to a band of smaller figures under it.',
      minimal: 'Minimalistic',
      minimalHint: 'Six equal cards on a frosted slab. Stays out of the way of the game.',
      torchlight: 'Torchlight',
      torchlightHint: 'Your best drop, large. Everything else inlined beneath it, in the idiom of an ARPG loot panel.',
    },
    appearance: {
      title: 'Appearance',
      transparent: 'Transparent background',
      transparentHint: 'Let the game show through the panel. The readout stays solid either way.',
      background: 'Background',
      scale: 'UI scale',
      blurb:
        'Ctrl +/− also changes the scale, and Ctrl+Alt +/− does it without clicking in first. The chevron collapses the panel to its cards, which are as tall as they are — so there the corner drags width only. Expanded, it keeps the height you drag it to.',
    },
    log: {
      title: 'Console log',
      blurb:
        'Dota writes its client console to a file when you launch it with -con_logfile. Point the tracker at that file and it reads the game’s own tracker lines as they land.',
      optimization: 'Optimization',
      trim: 'Keep the log small',
      trimNow: 'Trim now',
    },
    rooms: {
      title: 'Per room',
      room: 'room',
      runs: 'runs',
      average: 'avg',
      items: 'items',
    },
    skipped: {
      title: 'Unreadable lines',
      blurb: 'The game emitted tracker lines this build could not use — most likely a schema change.',
    },
    about: {
      title: 'About',
      app: 'AOW5 Tracker',
    },
  },

  update: {
    download: 'Download',
    restart: 'Restart and update',
    check: 'Check for updates',
    /*
     * The source tree updates the way the source tree does, so there is no
     * button to press and the sentence takes its place.
     */
    unsupportedBlurb:
      'Updates are for an installed build. This one runs from the source tree, so it updates the way the source tree does.',
    /**
     * Where the updater is, in a sentence beside the button.
     *
     * `notes` has already been cut down to one plain-text line by the caller —
     * GitHub's are markdown and can be a page long, and this is a caption on
     * one row of a settings panel.
     */
    describe: (state: UpdateState, notes: string | null): string => {
      switch (state.status) {
        case 'unsupported':
          return 'Only an installed build can update itself.';
        case 'idle':
          return '';
        case 'checking':
          return 'Asking GitHub…';
        case 'current':
          return 'This is the newest build.';
        case 'available':
          return notes === null ? `${state.version} is out.` : `${state.version} is out — ${notes}`;
        case 'downloading':
          return `Downloading ${state.version}… ${state.percent}%`;
        case 'ready':
          return `${state.version} is ready. Restarting ends the run you are in.`;
        case 'error':
          return `Could not check: ${state.message}`;
      }
    },
  },

  /**
   * What a trim did, in a sentence.
   *
   * `in-use` means the rewrite was attempted and the filesystem refused, which
   * on Windows is what a file another process holds open looks like. The error
   * code rides along because it is the difference between "the game has it",
   * which is expected and harmless, and something else entirely — and the two
   * used to print the same sentence.
   *
   * `mb` is passed in rather than formatted here so all three catalogs report
   * the same number in the same units.
   */
  trim: (trim: LogTrim, mb: (bytes: number) => string): string => {
    switch (trim.skipped) {
      case 'in-use':
        return `Dota still has the file open${trim.error === undefined ? '' : ` (${trim.error})`} — ${mb(trim.before)} for now.`;
      case 'missing':
        return 'No log there yet. Dota writes it when you launch with -con_logfile.';
      case 'small':
        return 'Nothing in it but tracker lines already.';
      default:
        return `${mb(trim.before)} → ${mb(trim.after)}, ${trim.kept} tracker lines kept.`;
    }
  },
};

/**
 * The shape every catalog has to have.
 *
 * Inferred from English rather than declared separately, so there is one place
 * a string is added and two places the compiler then demands it.
 */
export type Messages = typeof en;
