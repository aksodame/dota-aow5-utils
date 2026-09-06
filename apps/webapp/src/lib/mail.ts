import type { Lang } from '../i18n/strings.ts';

/**
 * The letter to the studio's support, ready to copy.
 *
 * The report argues its case to whoever happens to read it. This is the other
 * half: one address, one letter, and a button — so that a reader who agrees
 * with the document does not have to sit down and summarise 600 lines of it
 * themselves before they can send anything.
 *
 * **It is the author's own letter, in his voice**, not a form for the reader to
 * sign. Whoever copies it is forwarding what he wrote — which is why the first
 * paragraph says who is writing and why, and why it is signed. Rewriting it in
 * the sender's voice would put "I was banned" in the mouth of somebody it did
 * not happen to.
 *
 * Three properties this text has to keep, because it lives on a page for as
 * long as the page does:
 *
 * - **No "today", no "four days ago".** A template that dates itself relative
 *   to the moment it was written is wrong the next morning. Every date in it is
 *   absolute, and the reader can count the days themselves.
 * - **Nothing in it that the report cannot back.** Every numbered point below
 *   is a section of the document, and the document links each one to the
 *   message it came from. The two must not drift apart.
 * - **The links are passed in, not written here.** The report's own address
 *   depends on where the site is deployed; see `SupportMailBar`.
 */

/** The studio's support address, as given. */
export const SUPPORT_EMAIL = '294652794@qq.com';

/**
 * The one the recipient is most likely to actually read.
 *
 * A `qq.com` inbox belonging to a Chinese studio: the English and Russian
 * letters exist so the sender can see what they are sending, but the Chinese
 * one is the one with a chance of being read as written rather than through a
 * machine translation.
 */
export const PREFERRED_LETTER_LANG: Lang = 'zh';

/** The two addresses the letter points at, filled in by the caller. */
export interface LetterLinks {
  /** This site's `/report`, absolute — the page the letter is about. */
  report: string;
  /** The published chat export every quote in the report links into. */
  archive: string;
}

export interface Letter {
  subject: string;
  body: (links: LetterLinks) => string;
}

const en: Letter = {
  subject: 'AOW5 (Age of Weapons 5): the Discord staff exploit the game’s own bugs — a documented report',
  body: ({ report, archive }) => `Hello,

I am an ordinary player of the Age of Weapons 5 custom game and I am writing on my own initiative. I want to put a report in front of you — I was banned because of it, and I would like this to lead to a result rather than be ignored again. The letter went to the studio on 2 September 2026, and to feng, the developer, personally on 4 September. Four days passed with no reply from anyone, and on 5 September I published it, so that at least the players would react.

What the report says. Everything in it is quoted from the closed staff channels of the Age Of Weapon 5 Discord server, 17.08.2026 - 02.09.2026, and every quote carries a direct link to the original message:

1. Members of the Discord staff found an item duplication method, reported it to the developer themselves - and went on using it without waiting for a fix. The absence of a fix is what they openly called permission.
2. One of them ran the duplication for a friend. Asked how that was meant to be understood, he answered: "what are you going to do to me".
3. When another member of the staff told him he was in the wrong, the answer was that his only mistake was that he had been seen.
4. About a hundred duplicated envelopes went into the economy, and that moved auction prices for every player.
5. The bug has since been fixed, but there was no rollback: everything that was duplicated stayed on their accounts.
6. A step-by-step how-to for the bug was posted in the staff chat.
7. A member of the staff sells in-game gold for real money.
8. A paid "Verified Seller" role was being prepared - 700 RUB a month, a 30 million gold deposit, with the administration acting as the guarantor of the deals. The money for the role is collected by direct message by the same staff members.
9. After I said this out loud, my helper role was taken away, the stated reason being that I "was not doing my job". After the report was published, I was banned from the server.

Why this concerns the studio and not only that server. A player who finds a bug and reports it to the administration by direct message cannot count on it being fixed, nor on it not being used before the fix - by the very people he wrote to. The report channel stops being a report channel. The envelopes are only the part that became visible, because auction prices moved far enough for everyone to notice. Errors in drops, in prices, in rewards and in stat calculations are not visible at all, and they can affect the economy far more.

What I am asking for:
- check the logs for envelopes and essences between 31.08 and 02.09 and assess the real volume;
- decide on a rollback - this was already done for the auction facets;
- state a rule for the staff explicitly: a bug that is found is reported and is not used until it is fixed, neither for oneself nor for friends;
- review the standing of the members who used a bug they had reported themselves;
- define the position on selling in-game value for real money;
- separately: was the sale of gold under the administration's guarantee, and the paid "Verified Seller" role, approved by the developer?

The full report, in English, Russian and Chinese: ${report}
The chat export every quote links into, open to anybody: ${archive}

Thank you for reading to the end.

ilovehttp, Discord: @i_love_http`,
};

const ru: Letter = {
  subject: 'AOW5 (Age of Weapons 5): администрация Discord-сервера пользуется багами игры — документированный отчёт',
  body: ({ report, archive }) => `Здравствуйте,

я обычный игрок кастомной игры Age of Weapons 5 и пишу по собственной инициативе. Я хочу показать вам отчёт — меня из-за него забанили, и я хочу, чтобы у этой истории был результат, а не чтобы её снова проигнорировали. Письмо ушло в студию 2 сентября 2026 года, а лично разработчику feng — 4 сентября. Ответа не было четыре дня, и 5 сентября я опубликовал его, чтобы на это отреагировали хотя бы игроки.

О чём отчёт. Всё в нём — цитаты из закрытых служебных каналов Discord-сервера Age Of Weapon 5 за 17.08.2026 — 02.09.2026, и на каждое сообщение стоит прямая ссылка:

1. Участники команды Discord-сервера нашли способ дюпа предметов, сами сообщили о нём разработчику — и продолжили им пользоваться, не дожидаясь фикса. Отсутствие фикса они прямо называли разрешением.
2. Один из них сделал дюп для своего друга. На вопрос, как это понимать, он ответил: «а что ты мне сделаешь».
3. Когда другой участник команды сказал ему, что он не прав, ответ был такой: его единственная ошибка в том, что его увидели.
4. В экономику ушло около сотни задюпленных конвертов, и это сдвинуло аукционные цены для всех игроков.
5. Баг с тех пор починили, но отката не было: всё задюпленное осталось на их аккаунтах.
6. Пошаговая инструкция по багу была выложена в служебном чате.
7. Участник команды продаёт игровое золото за реальные деньги.
8. Готовился запуск платной роли «Verified Seller» — 700 ₽ в месяц, залог 30 млн золота, при этом администрация выступает гарантом сделок. Деньги за роль собирают в личных сообщениях те же участники команды.
9. После того как я сказал об этом вслух, с меня сняли роль хелпера — с формулировкой, что я «не выполнял свою работу». После публикации отчёта меня забанили на сервере.

Почему это касается студии, а не только сервера. Игрок, который нашёл баг и написал о нём администрации в личные сообщения, не может рассчитывать ни на то, что баг починят, ни на то, что им не воспользуются раньше — те самые люди, которым он написал. Канал приёма багов перестаёт быть каналом приёма багов. Конверты — это только та часть, которая стала видна, потому что цены на аукционе сдвинулись заметно для всех. Ошибки в дропе, в ценах, в наградах и в расчёте характеристик так не видны вообще, а на экономику влияют сильнее.

О чём я прошу:
— проверить логи по конвертам и эссенциям за 31.08—02.09 и оценить реальный объём;
— принять решение об откате — так уже делали с гранями на аукционе;
— явно сформулировать правило для команды: найденный баг сообщается и не используется до фикса — ни для себя, ни для друзей;
— пересмотреть статус участников, которые пользовались багом, о котором сами сообщили;
— определить позицию по продаже игровых ценностей за реальные деньги;
— отдельно: согласовывал ли разработчик продажу золота под гарантию администрации и платную роль «Verified Seller»?

Полный отчёт, на русском, английском и китайском: ${report}
Выгрузка переписки, на которую ссылается каждая цитата, открыта для всех: ${archive}

Спасибо, что дочитали.

ilovehttp, Discord: @i_love_http`,
};

const zh: Letter = {
  subject: 'AOW5（Age of Weapons 5）：Discord 管理团队利用游戏漏洞牟利 —— 一份附证据的举报',
  body: ({ report, archive }) => `您好：

我是《Age of Weapons 5》自定义游戏的一名普通玩家，出于自己的意愿写这封信。我想请您看一份举报——我因为它被封禁了，而我希望这件事最终能有一个结果，而不是再一次被忽略。这封信在 2026 年 9 月 2 日发给了工作室，9 月 4 日又单独发给了开发者 feng 本人。四天里没有收到任何一方的回复，于是 9 月 5 日我把它公开发布，至少让玩家们能够作出反应。

举报的内容。其中的一切都出自 Age Of Weapon 5 服务器的内部管理频道（2026.08.17 — 2026.09.02），每一条引文都附有指向原始消息的直接链接：

1. Discord 管理团队的成员发现了物品复制（dupe）的方法，自己向开发者上报了它——然后没有等修复就继续使用。他们公开地把"还没有修复"说成是一种许可。
2. 其中一人为自己的朋友做了复制。当被问到这该怎么理解时，他回答："你能拿我怎么样"。
3. 当另一名管理成员对他说这样不对时，他的回答是：我唯一的错就是被看见了。
4. 大约一百个被复制的信封进入了游戏经济，并因此推动了所有玩家面对的拍卖行价格。
5. 该漏洞此后已被修复，但没有进行回档：复制出来的东西仍然留在他们的账号上。
6. 该漏洞的分步操作教程被发在了内部管理频道里。
7. 管理团队的一名成员以真实货币出售游戏金币。
8. 他们正在筹备付费的 "Verified Seller" 身份组——每月 700 卢布，押金 3000 万金币，并由管理方作为交易的担保人。身份组的费用由同一批管理成员通过私信收取。
9. 在我把这些说出口之后，我的 helper 身份组被撤销，给出的理由是我"没有做好自己的工作"。举报公开之后，我被封禁了。

为什么这关系到工作室，而不只是那个服务器。一个玩家发现漏洞、通过私信向管理方上报，他既不能指望漏洞会被修复，也不能指望在修复之前没有人先用上它——而使用它的正是他上报的那些人。上报渠道就此不再是上报渠道。信封只是恰好被看见的那一部分，因为拍卖行价格的变化大到所有人都注意到了。掉落、价格、奖励以及属性计算上的错误则完全看不出来，而它们对经济的影响可能大得多。

我的请求：
— 核查 8 月 31 日至 9 月 2 日信封与精华的日志，评估实际数量；
— 就是否回档做出决定——拍卖行词条那次已经这样处理过；
— 明确地为管理团队立下规则：发现的漏洞要上报，并且在修复之前不得使用——无论是自己用还是给朋友用；
— 重新审视那些上报了漏洞却又使用它的成员的身份；
— 明确对"以真实货币出售游戏内价值"的立场；
— 另外：以管理方担保的金币交易，以及付费的 "Verified Seller" 身份组，是否经过开发者的同意？

完整举报，中文、英文与俄文：${report}
每条引文所指向的聊天记录导出，任何人都可以打开：${archive}

感谢您读到这里。

ilovehttp，Discord：@i_love_http`,
};

export const LETTERS: Record<Lang, Letter> = { en, ru, zh };

/** Subject and body as one block, which is what the copy button hands over. */
export function letterText(letter: Letter, links: LetterLinks): string {
  return `${letter.subject}\n\n${letter.body(links)}`;
}

/**
 * A `mailto:` for the reader's own mail app, filled in.
 *
 * Offered next to the copy button rather than instead of it: the body is a
 * couple of thousand characters, and some clients quietly truncate a `mailto:`
 * that long. Copying always works; this is the shortcut when it does.
 */
export function composeHref(letter: Letter, links: LetterLinks, to: string = SUPPORT_EMAIL): string {
  const query = new URLSearchParams({ subject: letter.subject, body: letter.body(links) });
  // `URLSearchParams` encodes a space as `+`, which mail clients show literally
  // in the body. Everything else it does is what a mailto wants.
  return `mailto:${to}?${query.toString().replace(/\+/g, '%20')}`;
}
