/**
 * Every string the site renders, in the three languages the game ships.
 *
 * One table rather than the two the previous site had. That split existed
 * because the planner and the marketing pages were written at different times
 * and by different logic; there is no marketing site any more, so there is one
 * table and one `useStrings`.
 *
 * The item, spell and map names are **not** here — those come from the game's
 * own localisation through `aow5-shared`, and duplicating them would mean two
 * places to be wrong.
 */

export const LANGS = ['en', 'ru', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

/**
 * A rarity's name, or the bare grade when it has none.
 *
 * The scale is 1-7 and every grade is named in all three languages, so the
 * fallback is for data drift rather than for translation gaps: a new grade in
 * an addon update should read as `Quality 8`, not as an empty pill.
 */
export function rarityLabel(strings: Strings, quality: number): string {
  const named = (strings.item.rarity as Record<number, string | undefined>)[quality];
  return named ?? `${strings.item.quality} ${quality}`;
}

export const LANG_LABEL: Record<Lang, string> = {
  en: 'English',
  ru: 'Русский',
  zh: '简体中文',
};

export interface Strings {
  brand: string;
  nav: { browse: string; mine: string; tracker: string; settings: string };
  auth: {
    signIn: string;
    signUp: string;
    signOut: string;
    signedInAs: string;
    nickname: string;
    nicknameHint: string;
    password: string;
    passwordHint: string;
    /** Between the local form and the provider buttons. */
    or: string;
    withSteam: string;
    withDiscord: string;
    /** While the browser is hunting for the proof-of-work nonce. */
    working: string;
    powFailed: string;
    haveAccount: string;
    noAccount: string;
    /** Shown when Steam bounced the visitor back without vouching for them. */
    failed: string;
    banned: string;
    required: string;
  };
  filters: {
    heading: string;
    hero: string;
    map: string;
    tier: string;
    any: string;
    anyTier: string;
    sort: string;
    sortTop: string;
    sortNew: string;
    sortDiscussed: string;
    sortCheap: string;
    sortCostly: string;
    clear: string;
    more: string;
    less: string;
  };
  browse: {
    search: string;
    searchHint: string;
    /**
     * The banner over the list, asking authors to bring their builds across
     * from the old site. Goes when the move is done — see `OLD_SITE_BUILDS`.
     */
    notice: string;
    empty: string;
    emptyHint: string;
    failed: string;
    likes: string;
    by: string;
    /** Unit for the match count above the list. */
    builds: string;
  };
  /** The read-only page for a loadout somebody shared as a link. */
  view: {
    heading: string;
    lead: string;
    /** The line under it: codec version, and what the board holds. */
    codec: string;
    items: string;
    spells: string;
    empty: string;
    emptyHint: string;
    /** When the link is from a deployment this one cannot read. */
    unreadable: string;
    unreadableHint: string;
  };
  build: {
    back: string;
    gear: string;
    spells: string;
    runes: string;
    consumables: string;
    neutral: string;
    backpack: string;
    notes: string;
    /** The unit, for a screen reader and for the exact figure in a tooltip. */
    gold: string;
    price: string;
    /** Shown in place of a figure when the author gave none. */
    noPrice: string;
    video: string;
    watchOnYoutube: string;
    playVideo: string;
    /** The label over the six worn slots, matching Neutral and Backpack. */
    main: string;
    like: string;
    liked: string;
    selfLike: string;
    signInToLike: string;
    /** Puts this page's address on the clipboard. */
    share: string;
    /**
     * Opens a loadout in the editor: the build page's "make one like this", and
     * the only action on a shared board. One label for both, because it is one
     * thing — the earlier "Clone build" said what happens to the *record*, and
     * a shared link has no record to clone.
     */
    openInEditor: string;
    copyLink: string;
    copied: string;
    referral: string;
    /** The dim run-in inside the copy button — `code:`. */
    referralPrefix: string;
    copyReferral: string;
    missing: string;
    missingHint: string;
    deleted: string;
    deletedHint: string;
    draft: string;
    empty: string;
    unknownItem: string;
    unknownMap: string;
    noMap: string;
    noHero: string;
    /** The caption on the headline ability, and the editor's label for choosing it. */
    mainSpell: string;
    /** The option that leaves the headline to the kit order. */
    mainSpellAuto: string;
    mainSpellHint: string;
    tier: string;
    /** The word for the Event category, which is not a numbered tier. */
    event: string;
    /**
     * The two dates a build page shows.
     *
     * Both, because they answer different questions: `published` is what
     * settles which guide said a thing first, and `updated` is whether the one
     * you are reading has been touched since the patch you are playing.
     */
    published: string;
    updated: string;
  };
  /**
   * The per-item panel: what to look for in each piece of gear.
   *
   * Several of these are statements about how the game works rather than
   * labels, and they are here rather than in the component because they are
   * the part a reader most needs in their own language — the maths is the same
   * in every one.
   */
  priority: {
    heading: string;
    /** One line under the heading, in the editor. */
    lead: string;
    /** The same, for somebody reading a build rather than writing one. */
    leadReading: string;
    /** After a count, in the panel's header: "6 items". */
    items: string;
    reforge: string;
    /** The option that sets no target, and how a reader sees one that is unset. */
    anyRoll: string;
    target: string;
    /** On the reachable range beside every stat. */
    rangeHint: string;
    /** The badge, and the word it is: no initials, in any language. */
    fixed: string;
    fixedHint: string;
    enhanced: string;
    enhancedHint: string;
    /**
     * The divine forge — the addon's 神铸.
     *
     * `divineShort` is what fits beside a checkbox on a row; `divine` is the
     * word itself, for the tooltip that explains what ticking it means.
     */
    divine: string;
    divineShort: string;
    divineHint: string;
    /**
     * The two halves of a card.
     *
     * `groupBase` is the item's own stat block; `groupPassive` is the figures
     * inside its passive, which roll the same way and are decided once, when
     * the item drops.
     */
    groupBase: string;
    groupPassive: string;
    /** Reads before a level range: "from level 4-9". */
    fromLevel: string;
    note: string;
    noteHint: string;
    /** When the board holds no gear yet. */
    empty: string;
    /** An item whose stats are the same on every copy. */
    nothingRolls: string;
    moveUp: string;
    moveDown: string;
  };
  mine: {
    heading: string;
    empty: string;
    emptyHint: string;
    create: string;
    edit: string;
    remove: string;
    removeConfirm: string;
    slotsUsed: string;
  };
  editor: {
    heading: string;
    newBuild: string;
    /** The second button, on a build that is already public. See `save`. */
    makeDraft: string;
    makeDraftHint: string;
    title: string;
    titleHint: string;
    notes: string;
    notesHint: string;
    /**
     * What a shared link does not carry.
     *
     * Under the fields only a *saved* build keeps: the board travels in the
     * address, the writing about it does not.
     */
    notShared: string;
    /**
     * The one thing a signed-out editor needs to know.
     *
     * Not a refusal: the board, the price and the code all work and can be
     * shared as a link this second. What needs an account is the *writing* —
     * notes and a video are kept on a saved build, so those two fields are
     * disabled rather than pretending to accept text nothing will keep.
     */
    signedOutNotice: string;
    hero: string;
    map: string;
    pickMap: string;
    pickItem: string;
    pickSpell: string;
    /** Shown when a slot holds a spell the current hero cannot offer. */
    noSpellsForKey: string;
    clearSlot: string;
    choose: string;
    search: string;
    noResults: string;
    save: string;
    saving: string;
    publish: string;
    unpublish: string;
    saved: string;
    discard: string;
    needTitle: string;
    needItems: string;
    limitReached: string;
    changeHeroWarning: string;
    referral: string;
    referralHint: string;
    tier: string;
    tierHint: string;
    mapHint: string;
    price: string;
    priceHint: string;
    /**
     * Why the number will not match what anybody else paid.
     *
     * A price in this game is a moving target — it is quoted for the opening of
     * a season and a busy league drags it down — so the field says so rather
     * than letting every reader discover it by being wrong.
     */
    priceDisclaimer: string;
    tierRequired: string;
    priceRequired: string;
    priceTooBig: string;
    video: string;
    videoHint: string;
    shareAnonymously: string;
    shareHint: string;
  };
  comments: {
    heading: string;
    placeholder: string;
    post: string;
    posting: string;
    empty: string;
    signedOut: string;
    /** The author deleted it; the row stays so the thread keeps its shape. */
    deleted: string;
    edited: string;
    edit: string;
    save: string;
    remove: string;
    removeConfirm: string;
    more: string;
    failed: string;
    tooSoon: string;
    duplicate: string;
    /** On the author's own copy of a comment a moderator has not let through yet. */
    pending: string;
    pendingHint: string;
  };
  /**
   * The account screen, and the badge that sends people to it.
   *
   * "Verified" here means one thing only: a Steam or Discord account is linked.
   * It is not a status, a rank or a moderator's opinion — see `isVerified` in
   * the API.
   */
  account: {
    heading: string;
    verified: string;
    unverified: string;
    /** Next to a nickname, as a tooltip. Says what the badge means and how to lose it. */
    unverifiedHint: string;
    /** On an author's name, which is a link to whichever profile it has. */
    steamProfile: string;
    discordProfile: string;
    whyVerify: string;
    providers: string;
    linked: string;
    notLinked: string;
    bind: string;
    /**
     * Why there is no button to undo a link.
     *
     * `unbind` and its confirmation are kept: the API still has the operation
     * behind a flag, and the day it comes back this is the wording it comes
     * back with.
     */
    bindPermanent: string;
    unbind: string;
    unbindConfirm: string;
    steam: string;
    discord: string;
    discordUnavailable: string;
    /** The four outcomes of a round trip to a provider. */
    linkOk: string;
    linkTaken: string;
    linkAlready: string;
    linkFailed: string;
    lastDoor: string;
    signedOut: string;
    /** The moderator's queue, which only an admin ever sees. */
    queue: string;
    queueEmpty: string;
    queueOn: string;
    approve: string;
    approved: string;
  };
  /**
   * The attribution, and the two links that go with it.
   *
   * This is the point of the footer rather than small print under it: these
   * tools render somebody else's art and somebody else's data, and say so on
   * every page that shows any of it.
   */
  footer: {
    attribution: string;
    workshop: string;
    source: string;
    builtWith: string;
  };
  /**
   * The words an item's hover card is built from.
   *
   * Restored wholesale from before the rewrite, which replaced a card the game
   * itself could have drawn with a name and two stats. Everything here labels a
   * fact the extracted data already carried — the rarity grade, the craft time,
   * the recipe — so the card was the only thing missing.
   */
  item: {
    level: string;
    /** Fallback for a grade with no name of its own — see `rarityLabel`. */
    quality: string;
    rarity: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>;
    loadingDetails: string;
    glyph: string;
    recipe: string;
    usedIn: (n: number) => string;
    tags: string;
    cooldown: string;
    manaCost: string;
    castRange: string;
    craftTime: string;
    skill: string;
    affects: string;
    /**
     * What goes between a label and its value — `Skill: Passive`.
     *
     * A string rather than a literal `:` in the JSX because Chinese sets it as
     * a fullwidth colon, which carries its own spacing.
     */
    colon: string;
    behavior: Record<'passive' | 'active' | 'toggle', string>;
    affectsLabel: (team: 'enemy' | 'friendly' | 'both', scope: 'units' | 'heroes' | 'creeps') => string;
  };
  tracker: {
    heading: string;
    back: string;
    /** The rebuild notice, and the way through to the site that still works. */
    building: string;
    buildingHint: string;
    openOldSite: string;
  };
  common: { loading: string; retry: string; cancel: string; close: string; language: string };
}

const en: Strings = {
  brand: 'AOW5 Builds',
  nav: { browse: 'Builder', mine: 'My Creations', tracker: 'Tracker', settings: 'Settings' },
  auth: {
    signIn: 'Sign in',
    signUp: 'Create an account',
    nickname: 'Nickname',
    nicknameHint: 'Letters, digits, _ and -. Cyrillic is fine.',
    password: 'Password',
    passwordHint: 'At least 8 characters. There is no password reset, so pick one you will remember.',
    or: 'or',
    withSteam: 'Continue with Steam',
    withDiscord: 'Continue with Discord',
    working: 'Checking you are not a script…',
    powFailed: 'That took too long. Try again.',
    haveAccount: 'Already have an account?',
    noAccount: 'No account yet?',
    signOut: 'Sign out',
    signedInAs: 'Signed in as',
    failed: 'Steam did not confirm that sign-in. Try again.',
    banned: 'That account is banned.',
    required: 'Sign in to do that.',
  },
  filters: {
    heading: 'Filter Builds',
    hero: 'Hero',
    map: 'Map',
    tier: 'Tier',
    any: 'Any',
    anyTier: 'Any tier',
    sort: 'Sort',
    sortTop: 'Most liked',
    sortNew: 'Newest',
    sortDiscussed: 'Most discussed',
    sortCheap: 'Cheapest first',
    sortCostly: 'Most expensive',
    clear: 'Clear filters',
    more: 'More',
    less: 'Less',
  },
  browse: {
    search: 'Search builds',
    searchHint: 'Title and notes',
    notice: 'Are you a build author? Please move your builds across from the previous version of this site:',
    empty: 'No builds match that.',
    emptyHint: 'Try a wider tier, or clear the filters.',
    failed: 'Could not load builds.',
    likes: 'likes',
    by: 'by',
    builds: 'builds',
  },
  view: {
    heading: 'Shared loadout',
    lead: 'Nobody published this one — it is a board somebody put in a link. Open it in the editor to change it, or to make it yours.',
    codec: 'Codec',
    items: 'items',
    spells: 'spells',
    empty: 'This link carries no loadout.',
    emptyHint: 'A shared board lives in the part of the address after the #. It looks like it was cut off.',
    unreadable: 'This link cannot be read here',
    unreadableHint: 'It was made by a newer version of the site. Nothing is lost — try again once this one has caught up.',
  },
  build: {
    back: 'Back to builds',
    gear: 'Gear',
    spells: 'Spells',
    runes: 'Runes',
    consumables: 'Consumables',
    neutral: 'Neutral',
    backpack: 'Backpack',
    notes: 'Notes',
    gold: 'gold',
    price: 'Price',
    noPrice: 'Not given',
    video: 'Video',
    watchOnYoutube: 'Watch on YouTube',
    playVideo: 'Play the video',
    main: 'Main',
    like: 'Like',
    liked: 'Liked',
    selfLike: 'You cannot like your own build.',
    signInToLike: 'Sign in to like a build.',
    share: 'Share build',
    openInEditor: 'Open editor',
    copyLink: 'Copy link',
    copied: 'Link copied',
    referral: 'Referral code',
    referralPrefix: 'code:',
    copyReferral: 'Copy referral code',
    missing: 'No such build.',
    missingHint: 'The link may be mistyped, or the build was never published.',
    deleted: 'This build was deleted.',
    deletedHint: 'Its author removed it. Nothing else was here.',
    draft: 'Draft',
    empty: 'Nothing placed here yet.',
    unknownItem: 'An item this site does not know yet',
    unknownMap: 'A map this site does not know yet',
    noMap: 'No map',
    noHero: 'No hero',
    mainSpell: 'Main spell',
    mainSpellAuto: 'Automatic',
    mainSpellHint: 'The ability a browse row leads with. Automatic reads the kit in order.',
    tier: 'Tier',
    event: 'Event',
    published: 'Published',
    updated: 'updated',
  },
  priority: {
    heading: 'Reforge priority',
    lead: 'Which copy of each item you actually want: the stats worth rerolling for, in order, and how far you reforge.',
    leadReading: 'What the author looks for in each piece, beyond having it.',
    items: 'items',
    reforge: 'Reforge',
    anyRoll: 'Any roll',
    target: 'target',
    rangeHint: 'What this stat can be, at this reforge level.',
    fixed: 'Fixed',
    fixedHint: 'the stat that carries +30% for good. Which one it is was decided when the item dropped, and reforging never moves it.',
    enhanced: 'Enhanced',
    enhancedHint: 'the stat the enhancement lands on, also decided when the item dropped:',
    divine: 'Divine forge',
    divineShort: 'Divine',
    divineHint: 'this figure assumes a divine-forged copy. One roll on the whole item, made when it dropped:',
    groupBase: 'Stats',
    groupPassive: 'Passive',
    fromLevel: 'from level',
    note: 'About this item',
    noteHint: 'The part no control covers — which half of the passive matters, a floor you will not go below.',
    empty: 'Put some gear on the board first.',
    nothingRolls: 'Nothing on this item rolls: every copy is the same.',
    moveUp: 'More important',
    moveDown: 'Less important',
  },
  mine: {
    heading: 'My Creations',
    empty: 'You have not made a build yet.',
    emptyHint: 'Five is the limit, so they are worth making count.',
    create: 'New build',
    edit: 'Edit',
    remove: 'Delete',
    removeConfirm: 'Delete this build? Its link will stop working.',
    slotsUsed: 'builds used',
  },
  editor: {
    heading: 'Editor',
    newBuild: 'New build',
    makeDraft: 'Make draft',
    makeDraftHint: 'Takes it off the site. The link keeps working for you, and nobody else can open it.',
    title: 'Title',
    titleHint: 'What this build is for',
    notes: 'Notes',
    notesHint: 'How to play it, what to buy first, what to skip',
    notShared: 'A shared link does not carry this — save the build to keep it.',
    signedOutNotice:
      'Notes are kept on a saved build, so writing them needs an account. Everything else works: build it, name a video, and share the link.',
    hero: 'Hero',
    map: 'Map',
    pickMap: 'Pick a map',
    pickItem: 'Pick an item',
    pickSpell: 'Pick a spell',
    noSpellsForKey: 'This hero has no finished ability for that key. You can still clear the slot.',
    clearSlot: 'Clear this slot',
    choose: 'Use this item',
    search: 'Search',
    noResults: 'Nothing matches that.',
    save: 'Save',
    saving: 'Saving…',
    publish: 'Publish',
    unpublish: 'Unpublish',
    saved: 'Saved',
    discard: 'Discard changes',
    needTitle: 'Give it a title first.',
    needItems: 'Place at least one item before publishing.',
    limitReached: 'You already have five builds. Delete one to make room.',
    changeHeroWarning: 'Changing hero clears the spells, because none are shared between heroes.',
    referral: 'Referral code',
    referralHint: 'Shown to anyone reading this build. Optional.',
    price: 'Price',
    tier: 'Tier',
    tierHint: 'Which tier this build is for. Required.',
    mapHint: 'A particular room at that tier, if the build is for one. Optional.',
    priceHint: 'What it cost you to put together, in gold.',
    priceDisclaimer:
      'Taken as the start of a season’s first week. Prices drift once a league is busy, so it may well be cheaper by the time somebody reads this.',
    tierRequired: 'Pick the tier this build is for.',
    priceRequired: 'A published build needs a price.',
    priceTooBig: 'That is more gold than exists. Four billion is the ceiling.',
    video: 'Video',
    videoHint: 'The video id from a YouTube link — the part after the last slash. Optional.',
    shareAnonymously: 'Copy share link',
    shareHint: 'The whole loadout fits in the link. No account needed to open it.',
  },
  comments: {
    heading: 'Comments',
    placeholder: 'Say something about this build',
    post: 'Post',
    posting: 'Posting…',
    empty: 'Nothing here yet. Be the first.',
    signedOut: 'Sign in to join in.',
    deleted: 'Comment deleted.',
    edited: 'edited',
    edit: 'Edit',
    save: 'Save',
    remove: 'Delete',
    removeConfirm: 'Delete this comment?',
    more: 'Show more',
    failed: 'Could not load the comments.',
    tooSoon: 'Give it a moment before posting again.',
    duplicate: 'You already said exactly that.',
    pending: 'Waiting for approval',
    pendingHint: 'Only you can see this one. Link Steam or Discord in Settings and your comments go up straight away.',
  },
  account: {
    heading: 'Settings',
    verified: 'Verified',
    unverified: 'Unverified',
    unverifiedHint: 'No Steam or Discord account linked yet. Comments from unverified accounts wait for a moderator.',
    steamProfile: 'Steam profile',
    discordProfile: 'Discord profile',
    whyVerify:
      'Linking an account is the whole of it — nothing is ever posted anywhere, and the site only reads a name and an avatar. Until then everything works, but your comments wait for a moderator before anybody else sees them. Each linked account also adds five build slots.',
    providers: 'Linked accounts',
    linked: 'Linked',
    notLinked: 'Not linked',
    bind: 'Link',
    bindPermanent: 'Linked for good. An account cannot be unlinked, because the verification it grants would otherwise be reusable.',
    unbind: 'Unlink',
    unbindConfirm: 'Unlink this account?',
    steam: 'Steam',
    discord: 'Discord',
    discordUnavailable: 'Discord is not set up on this server.',
    linkOk: 'Linked. Your comments go up straight away from now on.',
    linkTaken: 'That account is already linked to somebody else here.',
    linkAlready: 'You have already linked that one.',
    linkFailed: 'That did not work. Try again.',
    lastDoor: 'That is the only way into your account, so it cannot be unlinked.',
    signedOut: 'Sign in to see your settings.',
    queue: 'Comments waiting for approval',
    queueEmpty: 'Nothing is waiting.',
    queueOn: 'on',
    approve: 'Approve',
    approved: 'Approved.',
  },
  footer: {
    attribution:
      'Fan-made tools for the Age of Weapons 5 custom game. Not affiliated with or endorsed by Valve. Dota 2 and its item art are property of Valve Corporation; the Age of Weapons 5 data and custom art belong to the addon’s authors, and are used here only to display information about the custom game.',
    workshop: 'Age of Weapons 5 on the Steam Workshop',
    source: 'GitHub',
    builtWith: 'Free and open source. No ads, no analytics, and an account is optional.',
  },
  item: {
    level: 'Lv',
    quality: 'Quality',
    rarity: {
      1: 'Common',
      2: 'Uncommon',
      3: 'Rare',
      4: 'Epic',
      5: 'Legendary',
      6: 'Mythic',
      7: 'Divine',
    },
    loadingDetails: 'Loading details…',
    glyph: 'Glyph',
    recipe: 'Recipe',
    usedIn: (n) => `Used in ${n} recipe${n === 1 ? '' : 's'}`,
    tags: 'Tags',
    cooldown: 'Cooldown',
    manaCost: 'Mana cost',
    castRange: 'Cast range',
    craftTime: 'Craft time',
    skill: 'Skill',
    affects: 'Affects',
    colon: ': ',
    behavior: { passive: 'Passive', active: 'Active', toggle: 'Toggle' },
    affectsLabel: (team, scope) =>
      `${{ enemy: 'Enemy', friendly: 'Allied', both: 'All' }[team]} ${{ units: 'units', heroes: 'heroes', creeps: 'creeps' }[scope]}`,
  },
  tracker: {
    heading: 'Farm tracker',
    back: 'Back to builds',
    building: 'This page is still being rebuilt',
    buildingHint:
      'The download and the setup steps are on the old site until this one catches up. Everything else about the tracker is unchanged.',
    openOldSite: 'Open the old tracker page',
  },
  common: {
    loading: 'Loading…',
    retry: 'Try again',
    cancel: 'Cancel',
    close: 'Close',
    language: 'Language',
  },
};

const ru: Strings = {
  brand: 'Сборки AOW5',
  nav: { browse: 'Сборки', mine: 'Мои сборки', tracker: 'Трекер', settings: 'Настройки' },
  auth: {
    signIn: 'Войти',
    signUp: 'Создать аккаунт',
    nickname: 'Никнейм',
    nicknameHint: 'Буквы, цифры, _ и -. Кириллица подходит.',
    password: 'Пароль',
    passwordHint: 'Не меньше 8 символов. Восстановления пароля нет, так что выбирайте запоминающийся.',
    or: 'или',
    withSteam: 'Войти через Steam',
    withDiscord: 'Войти через Discord',
    working: 'Проверяем, что вы не скрипт…',
    powFailed: 'Не успели. Попробуйте ещё раз.',
    haveAccount: 'Уже есть аккаунт?',
    noAccount: 'Ещё нет аккаунта?',
    signOut: 'Выйти',
    signedInAs: 'Вы вошли как',
    failed: 'Steam не подтвердил вход. Попробуйте ещё раз.',
    banned: 'Этот аккаунт заблокирован.',
    required: 'Войдите, чтобы сделать это.',
  },
  filters: {
    heading: 'Фильтры',
    hero: 'Герой',
    map: 'Карта',
    tier: 'Тир',
    any: 'Любой',
    anyTier: 'Любой тир',
    sort: 'Сортировка',
    sortTop: 'По лайкам',
    sortNew: 'Новые',
    sortDiscussed: 'Обсуждаемые',
    sortCheap: 'Сначала дешёвые',
    sortCostly: 'Сначала дорогие',
    clear: 'Сбросить фильтры',
    more: 'Ещё',
    less: 'Свернуть',
  },
  browse: {
    search: 'Поиск сборок',
    searchHint: 'Название и заметки',
    notice: 'Вы автор сборок? Пожалуйста, перенесите их с предыдущей версии сайта:',
    empty: 'Ничего не найдено.',
    emptyHint: 'Попробуйте другой тир или сбросьте фильтры.',
    failed: 'Не удалось загрузить сборки.',
    likes: 'лайков',
    by: 'от',
    builds: 'сборок',
  },
  view: {
    heading: 'Сборка по ссылке',
    lead: 'Эта сборка не опубликована — кто-то просто поделился ссылкой. Откройте её в редакторе, чтобы изменить или сохранить как свою.',
    codec: 'Кодек',
    items: 'предметов',
    spells: 'умений',
    empty: 'В этой ссылке нет сборки.',
    emptyHint: 'Сборка живёт в части адреса после #. Похоже, она обрезалась.',
    unreadable: 'Эту ссылку здесь не прочитать',
    unreadableHint: 'Она сделана более новой версией сайта. Ничего не потеряно — попробуйте позже, когда эта версия догонит.',
  },
  build: {
    back: 'К списку сборок',
    gear: 'Снаряжение',
    spells: 'Умения',
    runes: 'Руны',
    consumables: 'Расходники',
    neutral: 'Нейтрал',
    backpack: 'Рюкзак',
    notes: 'Заметки',
    gold: 'золота',
    price: 'Цена',
    noPrice: 'Не указана',
    video: 'Видео',
    watchOnYoutube: 'Смотреть на YouTube',
    playVideo: 'Смотреть видео',
    main: 'Основное',
    like: 'Нравится',
    liked: 'Нравится',
    selfLike: 'Нельзя лайкнуть свою сборку.',
    signInToLike: 'Войдите, чтобы поставить лайк.',
    share: 'Поделиться сборкой',
    openInEditor: 'Открыть редактор',
    copyLink: 'Скопировать ссылку',
    copied: 'Ссылка скопирована',
    referral: 'Реферальный код',
    referralPrefix: 'код:',
    copyReferral: 'Скопировать реферальный код',
    missing: 'Такой сборки нет.',
    missingHint: 'Возможно, ссылка с опечаткой, или сборку не публиковали.',
    deleted: 'Эта сборка удалена.',
    deletedHint: 'Автор её убрал. Больше здесь ничего не было.',
    draft: 'Черновик',
    empty: 'Здесь пока пусто.',
    unknownItem: 'Предмет, который сайт ещё не знает',
    unknownMap: 'Карта, которую сайт ещё не знает',
    noMap: 'Без карты',
    noHero: 'Без героя',
    mainSpell: 'Главное умение',
    mainSpellAuto: 'Автоматически',
    mainSpellHint: 'Умение, с которого начинается строка в списке. «Автоматически» берёт первое по порядку.',
    tier: 'Тир',
    event: 'Событие',
    published: 'Опубликовано',
    updated: 'обновлено',
  },
  priority: {
    heading: 'Приоритет перековки',
    lead: 'Какой именно экземпляр предмета нужен: характеристики, ради которых стоит перекатывать, по порядку, и до какого уровня перековывать.',
    leadReading: 'Что автор ищет в каждом предмете, помимо самого предмета.',
    items: 'предметов',
    reforge: 'Перековка',
    anyRoll: 'Любой ролл',
    target: 'цель',
    rangeHint: 'Каким может быть этот параметр на этом уровне перековки.',
    fixed: 'Фиксированная',
    fixedHint: 'параметр, который навсегда получает +30%. Какой именно — решилось при выпадении, и перековка этого не меняет.',
    enhanced: 'Усиленная',
    enhancedHint: 'параметр, на который придётся усиление, тоже решённое при выпадении:',
    divine: 'Божественная ковка',
    divineShort: 'Бож.',
    groupBase: 'Характеристики',
    groupPassive: 'Пассивка',
    divineHint: 'это число предполагает экземпляр с божественной ковкой. Один ролл на весь предмет, сделанный при выпадении:',
    fromLevel: 'с уровня',
    note: 'Об этом предмете',
    noteHint: 'То, что не выражается контролами: какая часть пассивки важна, ниже какого значения не опускаться.',
    empty: 'Сначала положите на доску снаряжение.',
    nothingRolls: 'Здесь нечего перекатывать: все экземпляры одинаковы.',
    moveUp: 'Важнее',
    moveDown: 'Менее важно',
  },
  mine: {
    heading: 'Мои сборки',
    empty: 'Вы ещё не создали ни одной сборки.',
    emptyHint: 'Их можно держать не больше пяти, так что выбирайте с умом.',
    create: 'Новая сборка',
    edit: 'Изменить',
    remove: 'Удалить',
    removeConfirm: 'Удалить эту сборку? Её ссылка перестанет работать.',
    slotsUsed: 'сборок занято',
  },
  editor: {
    heading: 'Редактор',
    newBuild: 'Новая сборка',
    makeDraft: 'В черновик',
    makeDraftHint: 'Уберёт сборку с сайта. Ссылка останется рабочей для вас, а другие её не откроют.',
    title: 'Название',
    titleHint: 'Для чего эта сборка',
    notes: 'Заметки',
    notesHint: 'Как играть, что покупать первым, что пропустить',
    notShared: 'По ссылке это не передаётся — сохраните сборку, чтобы сохранить и это.',
    signedOutNotice:
      'Заметки хранятся у сохранённой сборки, поэтому для них нужен аккаунт. Всё остальное работает: собирайте, указывайте видео и делитесь ссылкой.',
    hero: 'Герой',
    map: 'Карта',
    pickMap: 'Выберите карту',
    pickItem: 'Выберите предмет',
    pickSpell: 'Выберите умение',
    noSpellsForKey: 'У этого героя нет готового умения для этой клавиши. Слот всё ещё можно очистить.',
    clearSlot: 'Очистить слот',
    choose: 'Выбрать предмет',
    search: 'Поиск',
    noResults: 'Ничего не найдено.',
    save: 'Сохранить',
    saving: 'Сохранение…',
    publish: 'Опубликовать',
    unpublish: 'Снять с публикации',
    saved: 'Сохранено',
    discard: 'Отменить изменения',
    needTitle: 'Сначала дайте название.',
    needItems: 'Поставьте хотя бы один предмет перед публикацией.',
    limitReached: 'У вас уже пять сборок. Удалите одну, чтобы освободить место.',
    changeHeroWarning: 'Смена героя очищает умения — они не пересекаются между героями.',
    referral: 'Реферальный код',
    referralHint: 'Виден всем, кто читает сборку. Необязательно.',
    price: 'Цена',
    tier: 'Тир',
    tierHint: 'Для какого тира эта сборка. Обязательно.',
    mapHint: 'Конкретная карта этого тира, если сборка про неё. Необязательно.',
    priceHint: 'Во сколько обошлась сборка, в золоте.',
    priceDisclaimer:
      'Считается на начало первой недели сезона. Когда лига оживает, цены падают — так что к моменту прочтения может выйти дешевле.',
    tierRequired: 'Выберите тир, для которого сборка.',
    priceRequired: 'Опубликованной сборке нужна цена.',
    priceTooBig: 'Столько золота не бывает. Потолок — четыре миллиарда.',
    video: 'Видео',
    videoHint: 'Идентификатор видео из ссылки YouTube — то, что после последнего слэша. Необязательно.',
    shareAnonymously: 'Скопировать ссылку',
    shareHint: 'Вся сборка помещается в ссылку. Аккаунт для открытия не нужен.',
  },
  comments: {
    heading: 'Комментарии',
    placeholder: 'Скажите что-нибудь об этой сборке',
    post: 'Отправить',
    posting: 'Отправка…',
    empty: 'Пока пусто. Будьте первым.',
    signedOut: 'Войдите, чтобы участвовать.',
    deleted: 'Комментарий удалён.',
    edited: 'изменён',
    edit: 'Изменить',
    save: 'Сохранить',
    remove: 'Удалить',
    removeConfirm: 'Удалить этот комментарий?',
    more: 'Показать ещё',
    failed: 'Не удалось загрузить комментарии.',
    tooSoon: 'Подождите немного перед следующим сообщением.',
    duplicate: 'Вы уже написали ровно это.',
    pending: 'Ждёт проверки',
    pendingHint: 'Пока его видите только вы. Привяжите Steam или Discord в настройках — и комментарии будут появляться сразу.',
  },
  account: {
    heading: 'Настройки',
    verified: 'Подтверждён',
    unverified: 'Не подтверждён',
    unverifiedHint: 'Ни Steam, ни Discord пока не привязаны. Комментарии с неподтверждённых аккаунтов ждут модератора.',
    steamProfile: 'Профиль Steam',
    discordProfile: 'Профиль Discord',
    whyVerify:
      'Достаточно привязать аккаунт — никуда ничего не публикуется, сайт читает только имя и аватар. До этого всё работает, но ваши комментарии ждут модератора, прежде чем их увидят другие. Каждый привязанный аккаунт добавляет ещё пять слотов под сборки.',
    providers: 'Привязанные аккаунты',
    linked: 'Привязан',
    notLinked: 'Не привязан',
    bind: 'Привязать',
    bindPermanent:
      'Привязано навсегда. Отвязать нельзя: иначе подтверждение, которое это даёт, можно было бы использовать повторно.',
    unbind: 'Отвязать',
    unbindConfirm: 'Отвязать этот аккаунт?',
    steam: 'Steam',
    discord: 'Discord',
    discordUnavailable: 'Discord на этом сервере не настроен.',
    linkOk: 'Привязано. Теперь комментарии появляются сразу.',
    linkTaken: 'Этот аккаунт уже привязан к другому профилю здесь.',
    linkAlready: 'Этот уже привязан.',
    linkFailed: 'Не получилось. Попробуйте ещё раз.',
    lastDoor: 'Это единственный способ войти в аккаунт, отвязать его нельзя.',
    signedOut: 'Войдите, чтобы открыть настройки.',
    queue: 'Комментарии на проверке',
    queueEmpty: 'Ничего не ждёт.',
    queueOn: 'к сборке',
    approve: 'Одобрить',
    approved: 'Одобрено.',
  },
  footer: {
    attribution:
      'Фанатские инструменты для пользовательской игры Age of Weapons 5. Не связаны с Valve и не одобрены ею. Dota 2 и изображения предметов принадлежат Valve Corporation; данные и оригинальные изображения Age of Weapons 5 принадлежат авторам аддона и используются здесь только для показа информации о пользовательской игре.',
    workshop: 'Age of Weapons 5 в Steam Workshop',
    source: 'GitHub',
    builtWith: 'Бесплатно и с открытым исходным кодом. Ни рекламы, ни аналитики, а аккаунт — по желанию.',
  },
  item: {
    level: 'Ур',
    quality: 'Качество',
    rarity: {
      1: 'Обычное',
      2: 'Необычное',
      3: 'Редкое',
      4: 'Эпическое',
      5: 'Легендарное',
      6: 'Мифическое',
      7: 'Божественное',
    },
    loadingDetails: 'Загрузка характеристик…',
    glyph: 'Руна',
    recipe: 'Рецепт',
    usedIn: (n) => `Используется в ${n} рецептах`,
    tags: 'Теги',
    cooldown: 'Перезарядка',
    manaCost: 'Расход маны',
    castRange: 'Дальность',
    craftTime: 'Время создания',
    skill: 'Навык',
    affects: 'Действует на',
    colon: ': ',
    behavior: { passive: 'Пассивный', active: 'Активный', toggle: 'Переключаемый' },
    affectsLabel: (team, scope) =>
      `${{ enemy: 'вражеских', friendly: 'союзных', both: 'всех' }[team]} ${{ units: 'юнитов', heroes: 'героев', creeps: 'крипов' }[scope]}`,
  },
  tracker: {
    heading: 'Трекер фарма',
    back: 'К списку сборок',
    building: 'Эта страница ещё переделывается',
    buildingHint:
      'Загрузка и настройка пока живут на старой версии сайта — пользуйтесь ей, пока эта страница не догонит. С самим трекером ничего не изменилось.',
    openOldSite: 'Открыть старую страницу трекера',
  },
  common: {
    loading: 'Загрузка…',
    retry: 'Ещё раз',
    cancel: 'Отмена',
    close: 'Закрыть',
    language: 'Язык',
  },
};

const zh: Strings = {
  brand: 'AOW5 配装',
  nav: { browse: '配装', mine: '我的配装', tracker: '追踪器', settings: '设置' },
  auth: {
    signIn: '登录',
    signUp: '注册账号',
    nickname: '昵称',
    nicknameHint: '字母、数字、_ 和 -，也可以用西里尔字母。',
    password: '密码',
    passwordHint: '至少 8 个字符。本站不提供找回密码，请选一个记得住的。',
    or: '或',
    withSteam: '用 Steam 登录',
    withDiscord: '用 Discord 登录',
    working: '正在确认你不是脚本…',
    powFailed: '用时过长，请再试一次。',
    haveAccount: '已经有账号了？',
    noAccount: '还没有账号？',
    signOut: '退出登录',
    signedInAs: '已登录',
    failed: 'Steam 未确认此次登录，请重试。',
    banned: '该账号已被封禁。',
    required: '请先登录再操作。',
  },
  filters: {
    heading: '筛选配装',
    hero: '英雄',
    map: '地图',
    tier: '层数',
    any: '全部',
    anyTier: '全部层数',
    sort: '排序',
    sortTop: '最多点赞',
    sortNew: '最新',
    sortDiscussed: '讨论最多',
    sortCheap: '价格从低到高',
    sortCostly: '价格从高到低',
    clear: '清除筛选',
    more: '更多',
    less: '收起',
  },
  browse: {
    search: '搜索配装',
    searchHint: '标题与说明',
    notice: '你是配装作者吗？请把你的配装从本站旧版本迁移过来：',
    empty: '没有符合的配装。',
    emptyHint: '试试其他层数，或清除筛选。',
    failed: '无法加载配装。',
    likes: '点赞',
    by: '作者',
    builds: '个配装',
  },
  view: {
    heading: '分享的配装',
    lead: '这份配装没有发布——只是有人把它放进了链接里。在编辑器中打开即可修改，或保存为自己的配装。',
    codec: '编码版本',
    items: '件装备',
    spells: '个技能',
    empty: '这个链接里没有配装。',
    emptyHint: '配装保存在地址中 # 之后的部分，看起来被截断了。',
    unreadable: '这里无法读取该链接',
    unreadableHint: '它来自更新版本的网站。内容没有丢失——等本站跟上后再试。',
  },
  build: {
    back: '返回配装列表',
    gear: '装备',
    spells: '技能',
    runes: '符文',
    consumables: '消耗品',
    neutral: '中立物品',
    backpack: '背包',
    notes: '说明',
    gold: '金币',
    price: '价格',
    noPrice: '未标注',
    video: '视频',
    watchOnYoutube: '在 YouTube 观看',
    playVideo: '播放视频',
    main: '主装备',
    like: '点赞',
    liked: '已点赞',
    selfLike: '不能给自己的配装点赞。',
    signInToLike: '请先登录再点赞。',
    share: '分享配装',
    openInEditor: '在编辑器中打开',
    copyLink: '复制链接',
    copied: '链接已复制',
    referral: '邀请码',
    referralPrefix: '邀请码：',
    copyReferral: '复制邀请码',
    missing: '没有这个配装。',
    missingHint: '链接可能有误，或该配装从未发布。',
    deleted: '该配装已被删除。',
    deletedHint: '作者已将其移除。',
    draft: '草稿',
    empty: '这里还没有内容。',
    unknownItem: '本站尚不认识的物品',
    unknownMap: '本站尚不认识的地图',
    noMap: '未选地图',
    noHero: '未选英雄',
    mainSpell: '主技能',
    mainSpellAuto: '自动',
    mainSpellHint: '列表中每一行首先显示的技能。“自动”按技能顺序取第一个。',
    tier: '层数',
    event: '活动',
    published: '发布于',
    updated: '更新于',
  },
  priority: {
    heading: '重铸优先级',
    lead: '你真正想要的是哪一件：值得重洗的属性，按顺序排列，以及重铸到几级。',
    leadReading: '除了拥有这件装备之外，作者还看重什么。',
    items: '件装备',
    reforge: '重铸',
    anyRoll: '任意词条',
    target: '目标',
    rangeHint: '在这个重铸等级下，这条属性的取值范围。',
    fixed: '固定属性',
    fixedHint: '永久获得 +30% 的那条属性，掉落时就已决定，重铸也不会改变。',
    enhanced: '强化属性',
    enhancedHint: '强化会落在哪条属性上，同样在掉落时决定：',
    divine: '神铸',
    divineShort: '神铸',
    groupBase: '属性',
    groupPassive: '被动',
    divineHint: '这个数值按神铸过的装备计算。神铸是整件装备掉落时的一次判定：',
    fromLevel: '需要等级',
    note: '关于这件装备',
    noteHint: '控件表达不了的部分：被动的哪一半重要，最低不能低于多少。',
    empty: '先在面板上放上装备。',
    nothingRolls: '这件装备没有可洗的属性：每一件都一样。',
    moveUp: '更重要',
    moveDown: '不那么重要',
  },
  mine: {
    heading: '我的配装',
    empty: '你还没有创建配装。',
    emptyHint: '最多只能保留五个，所以要用得值。',
    create: '新建配装',
    edit: '编辑',
    remove: '删除',
    removeConfirm: '删除这个配装？它的链接将失效。',
    slotsUsed: '个配装已使用',
  },
  editor: {
    heading: '编辑器',
    newBuild: '新建配装',
    makeDraft: '转为草稿',
    makeDraftHint: '将其从网站上撤下。链接对你仍然有效，其他人打不开。',
    title: '标题',
    titleHint: '这套配装的用途',
    notes: '说明',
    notesHint: '怎么玩、先买什么、跳过什么',
    notShared: '分享链接不会带上这部分——保存配装才能留住。',
    signedOutNotice: '说明保存在已保存的配装上，因此撰写说明需要账号。其他一切照常：配好、填上视频，再分享链接。',
    hero: '英雄',
    map: '地图',
    pickMap: '选择地图',
    pickItem: '选择物品',
    pickSpell: '选择技能',
    noSpellsForKey: '该英雄在此按键上没有已完成的技能。仍可清空此格。',
    clearSlot: '清空此格',
    choose: '使用此物品',
    search: '搜索',
    noResults: '没有匹配项。',
    save: '保存',
    saving: '保存中…',
    publish: '发布',
    unpublish: '取消发布',
    saved: '已保存',
    discard: '放弃更改',
    needTitle: '请先填写标题。',
    needItems: '发布前请至少放入一件物品。',
    limitReached: '你已有五个配装。请先删除一个。',
    changeHeroWarning: '更换英雄会清空技能，因为英雄之间不共享技能。',
    referral: '邀请码',
    referralHint: '所有阅读此配装的人都能看到。可不填。',
    price: '价格',
    tier: '层数',
    tierHint: '这套配装针对哪个层数。必填。',
    mapHint: '该层数里的某张地图，如果配装是针对它的。可不填。',
    priceHint: '这套配装花了多少金币。',
    priceDisclaimer: '按赛季第一周开服时计算。联赛热起来之后价格会往下走，别人看到时可能更便宜。',
    tierRequired: '请选择这套配装针对的层数。',
    priceRequired: '发布的配装需要填写价格。',
    priceTooBig: '金币没有这么多，上限是四十亿。',
    video: '视频',
    videoHint: 'YouTube 链接中的视频 ID——最后一个斜杠后面的部分。可不填。',
    shareAnonymously: '复制分享链接',
    shareHint: '整套配装都在链接里，打开无需账号。',
  },
  comments: {
    heading: '评论',
    placeholder: '说说这套配装',
    post: '发表',
    posting: '发表中…',
    empty: '还没有评论，来做第一个。',
    signedOut: '请先登录再参与讨论。',
    deleted: '该评论已删除。',
    edited: '已编辑',
    edit: '编辑',
    save: '保存',
    remove: '删除',
    removeConfirm: '删除这条评论？',
    more: '加载更多',
    failed: '无法加载评论。',
    tooSoon: '请稍等一下再发。',
    duplicate: '你刚刚已经说过一模一样的话了。',
    pending: '等待审核',
    pendingHint: '目前只有你能看到这条。在设置里绑定 Steam 或 Discord，之后评论就会立即显示。',
  },
  account: {
    heading: '设置',
    verified: '已验证',
    unverified: '未验证',
    unverifiedHint: '尚未绑定 Steam 或 Discord。未验证账号的评论需要等待审核。',
    steamProfile: 'Steam 个人资料',
    discordProfile: 'Discord 个人资料',
    whyVerify:
      '只需绑定一个账号即可——不会往任何地方发布内容，网站只读取名称和头像。在此之前一切功能照常，但你的评论要先经过审核，别人才能看到。每绑定一个账号还会多出五个配装位。',
    providers: '已绑定的账号',
    linked: '已绑定',
    notLinked: '未绑定',
    bind: '绑定',
    bindPermanent: '绑定后不可撤销：否则它带来的验证状态就可以被反复使用。',
    unbind: '解绑',
    unbindConfirm: '要解绑这个账号吗？',
    steam: 'Steam',
    discord: 'Discord',
    discordUnavailable: '本服务器未配置 Discord。',
    linkOk: '已绑定。从现在起你的评论会立即显示。',
    linkTaken: '该账号已绑定到这里的另一个账户。',
    linkAlready: '这个你已经绑定过了。',
    linkFailed: '没有成功，请再试一次。',
    lastDoor: '这是进入你账户的唯一方式，无法解绑。',
    signedOut: '登录后即可查看设置。',
    queue: '等待审核的评论',
    queueEmpty: '没有待审核的内容。',
    queueOn: '于',
    approve: '通过',
    approved: '已通过。',
  },
  footer: {
    attribution:
      '为 Age of Weapons 5 自定义游戏做的玩家自制工具。与 Valve 无关，也未获其认可。Dota 2 及其物品美术归 Valve Corporation 所有；Age of Weapons 5 的数据与自制美术归模组作者所有，此处仅用于展示这个自定义游戏的相关信息。',
    workshop: 'Steam 创意工坊上的 Age of Weapons 5',
    source: 'GitHub',
    builtWith: '免费、开源。没有广告，没有统计追踪，账号也是可选的。',
  },
  item: {
    level: 'Lv',
    quality: '品质',
    rarity: {
      1: '普通',
      2: '优秀',
      3: '稀有',
      4: '史诗',
      5: '传说',
      6: '神话',
      7: '神圣',
    },
    loadingDetails: '正在加载详情…',
    glyph: '符印',
    recipe: '配方',
    usedIn: (n) => `用于 ${n} 个配方`,
    tags: '标签',
    cooldown: '冷却',
    manaCost: '魔法消耗',
    castRange: '施法距离',
    craftTime: '制作时间',
    skill: '技能',
    affects: '作用于',
    colon: '：',
    behavior: { passive: '被动', active: '主动', toggle: '切换' },
    affectsLabel: (team, scope) =>
      `${{ enemy: '敌方', friendly: '友方', both: '全体' }[team]}${{ units: '单位', heroes: '英雄', creeps: '小兵' }[scope]}`,
  },
  tracker: {
    heading: '打宝追踪器',
    back: '返回配装列表',
    building: '此页面仍在重建中',
    buildingHint: '在本页赶上之前，下载和设置步骤都在旧版网站上。追踪器本身没有任何变化。',
    openOldSite: '打开旧版追踪器页面',
  },
  common: {
    loading: '加载中…',
    retry: '重试',
    cancel: '取消',
    close: '关闭',
    language: '语言',
  },
};

export const STRINGS: Record<Lang, Strings> = { en, ru, zh };

const STORAGE_KEY = 'aow5.lang';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * The language to open in: what they chose last, else what the browser asks
 * for, else English.
 *
 * `navigator.languages` rather than `navigator.language`, so somebody whose
 * first preference is a language this site does not have still gets their
 * second rather than falling straight to English.
 */
/** The query parameter a language travels in, so a link can carry one. */
export const LANG_PARAM = 'lang';

/**
 * Which language to render in.
 *
 * Three sources, most specific first. `?lang=` wins because it is the one
 * somebody can have put there deliberately — a link shared to a Russian
 * channel should open in Russian whatever the reader picked last. Then the
 * stored choice, then what the browser says it wants.
 */
export function detectLang(): Lang {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(LANG_PARAM);
    if (isLang(fromUrl)) return fromUrl;
  } catch {
    // No `window` — nothing on this site runs there, but the guard is free.
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // A browser with storage blocked still gets a language.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not worth telling anyone about; the choice just will not survive a reload.
  }
}
