import type { CardId } from '@core/cards.ts';
import type { RunOutcome } from '@core/stats.ts';
import type { LogTrim, UpdateState } from '@core/ipc.ts';
import type { Messages } from './en';

/**
 * 简体中文.
 *
 * Typed against `Messages`, so this file cannot fall behind English: a string
 * added there is a compile error here until it is translated.
 *
 * The wording follows the addon's own Chinese, which is the language the map
 * was written in — 秘境 for a room, 金币 for gold, 掉落 for a drop — so the
 * overlay reads as part of the game rather than as a translation of an English
 * tool. Item and room names come from `addon_schinese.txt` for the same reason.
 *
 * Two habits of the script show up in the layout. Chinese has no plural and no
 * article, so the counted forms are short — `${n} 件` rather than a sentence —
 * and nothing here needs a `plural` helper. And it has no spaces, so a name in
 * a fixed-width tile wraps by character rather than by word; the recipe tile
 * relies on `break-words` for that.
 */
export const zh: Messages = {
  common: {
    cancel: '取消',
    close: '关闭此窗口',
    refresh: '刷新',
    choose: '选择',
    notSet: '未设置',
    none: '—',
  },

  window: {
    brand: 'AOW5',
    farm: '追踪器',
    settings: '设置',
    history: '历史',
  },

  shell: {
    expand: '展开完整面板',
    collapse: '收起为数据卡片',
    pinHint: (hotkey: string) => `按 ${hotkey} 取消聚焦，固定在游戏上方`,
    configureHint: (hotkey: string) => `按 ${hotkey} 进行设置`,
  },

  farm: {
    startClock: '开始本场计时',
    pauseClock: '暂停本场计时 —— 掉落仍会统计',
    restart: '开始新的一场 —— 所有数据归零',
    undoDeath: '撤销 —— 重新计入上一个秘境',
    markDeath: '在此阵亡 —— 从本场中扣除该秘境的掉落，保留时间',
    history: '历史',
    settings: '设置',
    quit: '退出追踪器',
  },

  stateLine: {
    /* 中文里“在”既能带处所名词也能带地名，所以两条前缀相同 —— 这一对存在
       是为了让每种语言都能自己决定，而不是强迫每种语言都区分。 */
    inHideout: '在',
    atRoom: '在',
    hideout: '藏身处',
    runs: '本场已完成的次数',
  },

  hud: {
    cardLabel: {
      session: '本场时长',
      sessionGold: '本场金币',
      sessionBest: '本场最佳',
      mapTime: '当前时长',
      mapGold: '当前金币',
      mapGoldAverage: '每图金币',
      mapTimeAverage: '每图时长',
      goldPerHour: '每小时金币',
    } as Record<CardId, string>,
    cardTitle: {
      session: '自本场开始起算 —— 藏身处和读条时间也计入',
      sessionGold: '本场掉落的全部物品，按列表同样的价格计算',
      sessionBest: '本场价值最高的物品',
      mapTime: '你在当前秘境里待了多久',
      mapGold: '下方秘境掉落的物品，按列表同样的价格计算',
      mapGoldAverage: '本场已完成秘境的平均金币 —— 正在进行的这个还不计入',
      mapTimeAverage: '本场已完成秘境的平均用时',
      goldPerHour: '每小时金币，只计算待在秘境里的时间',
    } as Record<CardId, string>,
    bestTitle: (item: string) => `${item} —— 本场价值最高的一堆`,
    columns: {
      name: '掉落',
      unit: '单价',
      total: '合计',
    },
    sortBy: (column: string) => `按“${column}”排序`,
    emptyTracked: '这个秘境里还没掉出你关注的物品。',
    empty: '这里还什么都没掉。',
    customPrice: (table: number) => `你设定的价格。若不设定，此物只值 ${table} 金。`,
  },

  recipe: {
    add: '添加配方或物品',
    addLabel: '配方',
    stopCrafting: (item: string) => `不再制作${item}`,
    stopCraftingHint: '不再制作它 —— 当作普通材料统计',
    craftInstead: (item: string) => `改为自己制作${item}`,
    craftInsteadHint: '改为自己制作 —— 单独占一行',
    oneFewer: (item: string) => `${item}减少一个`,
    oneFewerHint: '减少一个',
    removeTarget: (item: string) => `移除${item}`,
    removeTargetHint: '移除',
    oneMore: (item: string) => `${item}增加一个`,
    oneMoreHint: '增加一个',
    tickHint: (item: string, have: number, need: number) => `${item} ${have}/${need} —— 点击标记为已备齐`,
    ingredient: (item: string, have: number, need: number) => `${item}，${need} 个中已有 ${have} 个`,
    picker: {
      recipes: '配方',
      anyItem: '任意物品',
      searchRecipes: '搜索配方…',
      searchItems: '搜索物品…',
      loading: '正在加载配方…',
      noRecipe: '没有叫这个名字的可制作物品。试试“任意物品”。',
      noItem: '没有叫这个名字的物品。',
    },
  },

  history: {
    reading: '正在读取存档…',
    empty: '还没有任何记录。一场记录会在它的第一次秘境结束后落到这里 —— 你正在进行的这次还属于悬浮窗。',
    select: (when: string) => `选择 ${when} 的这一场`,
    mock: '模拟',
    runCount: (runs: number) => `${runs} 次`,
    stats: {
      active: '有效时长',
      gold: '金币',
      value: '价值',
      items: '物品',
    },
    noRuns: '没有记录。',
    sessionTotal: '本场合计',
    itemCount: (items: number) => `${items} 种`,
    nothingDropped: '没有掉落。',
    deleteSelectedHint: '删除勾选的场次，以及记在它们名下的每一次秘境。',
    deleteAllHint: '删除存档中的每一场。屏幕上正在进行的这一场会继续统计。',
    deleteSelected: (count: number) => `删除 ${count} 场`,
    confirmSelected: (count: number) => `确认删除 ${count} 场？`,
    deleteAll: '全部清空',
    confirmAll: '确认全部删除？',
    newer: '更新',
    older: '更早',
    page: (current: number, total: number) => `${current} / ${total}`,
    pageHint: (current: number, total: number) => `第 ${current} 页，共 ${total} 页`,
    outcome: {
      open: '进行中',
      clear: '已通关',
      chained: '连续进入',
      abandoned: '中途退出',
      other: '其他',
      died: '阵亡',
    } as Record<RunOutcome, string>,
  },

  settings: {
    prices: {
      title: '物品价格',
      blurb:
        '数据表里记的是物品的售价，而这未必等于它对你的价值。设定你自己的价格，所有金币数字都会跟着它走：每小时金币、本场合计、掉落列表和历史存档一律如此。你没有表态的物品沿用表价。',
      halve: '商人只出一半价',
      halveHint: '商人按表价的一半收购，所以未定价的掉落一律折半计算。你在下面设定的价格无论如何都按原样使用。',
      search: '搜索要定价的物品…',
      table: (gold: string) => `表价 ${gold}`,
      tableHint: '若不设定你自己的价格，它值多少',
      field: (item: string) => `${item}的价格`,
      clear: (item: string) => `移除你为${item}设定的价格`,
      clearHint: '移除这个价格 —— 恢复表价',
    },
    tracked: {
      title: '关注的物品',
      blurb:
        '把你在意的物品钉住，展开后的面板就只列这些，本场合计也只算这些。一个都不钉，则列出捡到的一切。无论这里钉了什么，历史存档始终记录全部。',
      search: '按名称搜索…',
      untrack: (item: string) => `不再关注${item}`,
      untrackHint: '不再关注',
    },
    shortcuts: {
      title: '快捷键',
      blurb:
        '游戏处于前台时追踪器会响应的按键。动作键是所有快捷键共用的修饰键——如果它的组合已被占用，改一次，全部快捷键都会随之改变。',
      actionKey: '动作键',
      actionKeyHint: '与下面每个快捷键一起按下，这样就不会和游戏已用的按键冲突。',
      name: {
        focus: '聚焦浮层',
        die: '将上一个房间标记为阵亡',
      } as Record<string, string>,
      hint: {
        focus: '让面板可点击，便于拖动、调整大小和设置。再按一次即可重新固定在游戏之上。',
        die: '与标题栏的骷髅按钮相同，但无需先聚焦浮层——该房间的战利品不再计入本次会话，而时间仍然计入。',
      } as Record<string, string>,
      record: '请按一个键…',
      recordHint: '点击后按下想要的按键。按 Esc 保持不变。',
      rebind: (action: string) => `更改按键：${action}`,
      reset: '重置',
      resetHint: '恢复默认按键',
      clash: '两个快捷键使用了同一个按键——只有一个会生效。',
      taken: '该按键已被其他应用占用。',
    },
    sounds: {
      title: '声音',
      enabled: '掉落时播放提示音',
      enabledHint: '每次捡到符合条件的物品就响一次——命中下面的品阶规则，或该物品自己的声音。“猩红之心”默认绑定头奖音效；解绑之后就一直是解绑状态。',
      volume: '音量',
      limit: '截断过长的声音',
      limitHint: '几秒后淡出，而不是把整个文件放完。',
      limitAfter: '截断于',
      seconds: (value: number) => `${value} 秒`,
      rules: '按品阶',
      rulesHint: '为单个物品设置的声音优先，其次是品质，最后是等级；一次掉落只响一次，无论命中几条规则。',
      byQuality: '品质',
      byLevel: '等级',
      rarity: {
        1: '普通',
        2: '优秀',
        3: '稀有',
        4: '史诗',
        5: '传说',
        6: '神话',
        7: '神圣',
      } as Record<number, string>,
      level: (n: number) => `${n} 级`,
      rule: (grade: string) => `${grade} 的声音`,
      builtins: '内置',
      find: '找一个声音',
      findHint:
        '在 Freesound 上搜索 —— 一个 Creative Commons 声音库。添加后会下载并随设置一起保存，包括作者与许可，然后就能在上方绑定到物品或品阶上。库中大部分声音只要求标明作者。',
      findPlaceholder: '金币、号角、爆炸…',
      by: (who: string) => `作者：${who}`,
      add: (sound: string) => `添加${sound}`,
      addHint: '添加并试听',
      addFail: '无法下载这个声音。',
      noHits: '没有找到。换个更简单的词试试。',
      searchFail: {
        off: '配置中已关闭声音搜索。',
        offline: '无法连接搜索服务器。',
        unconfigured: '该服务器没有声音库密钥。',
        busy: '请求太频繁，稍后再试。',
        failed: '搜索没有返回可用的结果。',
      },
      filter: '筛选声音…',
      noMatch: '没有同名的声音',
      choose: '选择文件…',
      remove: '清除',
      search: '搜索要绑定声音的物品…',
      play: (sound: string) => `播放“${sound}”`,
      playHint: '试听',
      pick: (item: string) => `为${item}选择声音`,
      pickHint: '选择文件',
      unbind: (item: string) => `解绑${item}`,
      unbindHint: '解绑',
      floor: '仅在价格高于此值时响铃',
      floorHint: '便宜的掉落无论品级都保持安静。按你的价格计算单件价值——不按整堆，所以一大堆便宜货依然便宜。',
      floorField: '掉落物的最低价值',
      muted: '永不响铃',
      mutedHint: '这些物品始终保持安静，包括它们自己的绑定音效。选择稀有度或等级来浏览某一层，或按名称搜索。',
      mutedAny: '任意',
      mutedSearch: '搜索要静音的物品…',
      mutedEmpty: '尚未静音任何物品。',
      mutedMore: (n: number) => `还有 ${n} 项 — 请缩小范围`,
      mutedNone: '该品级中没有物品。',
      mute: (item: string) => `静音 ${item}`,
      muteHint: '永不为此响铃',
      unmute: (item: string) => `取消静音 ${item}`,
      unmuteHint: '恢复响铃',
      perItem: '按物品',
      perItemHint: '物品自身的音效优先于下面两个网格。',
      silencedMuted: '已在下方静音 — 不会响铃',
      silencedFloor: '低于价格下限 — 不会响铃',
    },
    session: {
      title: '本场',
      autoResume: '进入第一个秘境时开始计时',
      autoResumeHint:
        '一场开始时是暂停的，这样追踪器可以在 Dota 读条时就开着，而那段时间不算刷图。打开此项后，走进秘境就等于替你按下开始。你在中途手动按下的暂停仍然有效，直到下一个秘境为止。',
    },
    cards: {
      title: 'HUD 卡片',
      blurb:
        '刷图悬浮窗上的数据卡片，按下面的顺序每行三张。关掉一张不会留下空缺 —— 后面的会补上来，顺序不变，所以每一行总是从左边排满。顺序本身不可更改：两行分别读作“本场”和“秘境”。',
      lastOne: (hint: string) => `${hint} HUD 至少需要一张卡片；先打开另一张，才能关掉这张。`,
      name: {
        session: '本场时长',
        sessionGold: '本场金币',
        sessionBest: '本场最佳',
        mapTime: '当前时长',
        mapGold: '当前金币',
        mapGoldAverage: '每图金币',
        mapTimeAverage: '每图时长',
        goldPerHour: '每小时金币',
      } as Record<CardId, string>,
      hint: {
        session: '自本场开始起算。藏身处和读条时间也计入。',
        sessionGold: '本场掉落的全部物品，按你设定的价格计算。',
        sessionBest: '价值最高的那一堆，用图标表示。',
        mapTime: '你在当前秘境里待了多久。',
        mapGold: '下方秘境掉落的物品，按列表同样的价格计算。',
        mapGoldAverage: '已完成秘境的平均金币。正在进行的那个要等结束后才计入。',
        mapTimeAverage: '已完成秘境的平均通关用时。',
        goldPerHour: '只计算待在秘境里的时间，不含藏身处。',
      } as Record<CardId, string>,
    },
    language: {
      title: '语言',
      blurb:
        '悬浮窗自己的用词，连同物品名和秘境名一起 —— 数据表三种语言都带着，所以不会只翻译一半。“自动”跟随 Windows 的语言。',
      auto: '自动',
      en: 'English',
      ru: 'Русский',
      zh: '简体中文',
    },
    style: {
      title: '追踪器样式',
      blurb:
        '数据如何排布，而不只是配色。“极简”给每个数据同样大小的卡片，让你自己挑要看的那个。“火炬之光”把本场最值钱的掉落放大置顶，其余的收进下方一条小字带里。',
      minimal: '极简',
      minimalHint: '磨砂玻璃上的六张等大卡片。不会挡着游戏。',
      torchlight: '火炬之光',
      torchlightHint: '最佳掉落放大显示，其余的排在它下方 —— 取自 ARPG 战利品面板的语汇。',
    },
    appearance: {
      title: '外观',
      transparent: '透明背景',
      transparentHint: '让游戏画面透过面板。无论开关与否，面板上的数据都保持清晰。',
      background: '背景',
      scale: '界面缩放',
      blurb:
        'Ctrl +/− 同样可以改变缩放，Ctrl+Alt +/− 则无需先点进窗口。折角箭头把面板收起为卡片，卡片有多高就是多高 —— 那时拖角只能改变宽度。展开时，面板保持你拖出来的高度。',
    },
    log: {
      title: '控制台日志',
      blurb:
        '用 -con_logfile 启动时，Dota 会把客户端控制台写进一个文件。把追踪器指向那个文件，它就会在追踪器行落盘的同时读取它们。',
      optimization: '优化',
      trim: '保持日志较小',
      trimNow: '立即精简',
    },
    rooms: {
      title: '按秘境统计',
      room: '秘境',
      runs: '次数',
      average: '平均',
      items: '物品',
    },
    skipped: {
      title: '无法解析的行',
      blurb: '游戏输出了此版本无法使用的追踪器行 —— 多半是数据格式变了。',
    },
    about: {
      title: '关于',
      app: 'AOW5 Tracker',
    },
  },

  update: {
    download: '下载',
    restart: '重启并更新',
    check: '检查更新',
    unsupportedBlurb: '更新是给安装版用的。这一份从源码运行，因此它更新的方式和源码一样。',
    describe: (state: UpdateState, notes: string | null): string => {
      switch (state.status) {
        case 'unsupported':
          return '只有安装版才能自我更新。';
        case 'idle':
          return '';
        case 'checking':
          return '正在询问 GitHub…';
        case 'current':
          return '这已经是最新版本。';
        case 'available':
          return notes === null ? `${state.version} 已发布。` : `${state.version} 已发布 —— ${notes}`;
        case 'downloading':
          return `正在下载 ${state.version}… ${state.percent}%`;
        case 'ready':
          return `${state.version} 已就绪。重启会中断你正在进行的这一次。`;
        case 'error':
          return `检查失败：${state.message}`;
      }
    },
  },

  trim: (trim: LogTrim, mb: (bytes: number) => string): string => {
    switch (trim.skipped) {
      case 'in-use':
        return `Dota 仍占用着该文件${trim.error === undefined ? '' : `（${trim.error}）`} —— 目前 ${mb(trim.before)}。`;
      case 'missing':
        return '那里还没有日志。用 -con_logfile 启动时 Dota 才会写。';
      case 'small':
        return '里面本来就只有追踪器的行。';
      default:
        return `${mb(trim.before)} → ${mb(trim.after)}，保留追踪器行 ${trim.kept} 条。`;
    }
  },
};
