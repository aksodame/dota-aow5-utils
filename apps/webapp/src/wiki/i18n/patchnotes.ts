import type { Localised } from './index';

export interface PatchnotesStrings {
  title: string;
  lead: string;
  disclaimer: string;
  game: string;
  wiki: string;
}

export const PATCHNOTES: Localised<PatchnotesStrings> = {
  en: {
    title: 'Patch notes',
    lead: 'What changed in the game and in the wiki',
    disclaimer:
      'Kept by hand and covers recent versions. If something here does not match your version of the game, trust the game.',
    game: 'In the game',
    wiki: 'In the wiki',
  },
  ru: {
    title: 'Патчноуты',
    lead: 'Что менялось в игре и в вики',
    disclaimer:
      'Список ведётся вручную и покрывает недавние версии. Если что-то не совпадает с вашей версией игры — ориентируйтесь на игру.',
    game: 'В игре',
    wiki: 'В вики',
  },
  zh: {
    title: '更新日志',
    lead: '游戏与百科的改动',
    disclaimer: '本列表为手工整理，仅覆盖近期版本。如与你的游戏版本不符，请以游戏为准。',
    game: '游戏内',
    wiki: '百科',
  },
};
