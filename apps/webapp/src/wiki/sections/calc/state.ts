import { useCallback, useEffect, useState } from 'react';
import { hydrateRollState, type RollState } from 'aow5-shared/wiki';
import type { SlotKind } from '../../i18n/calc';
import type { AttrMode } from './model';

/**
 * What the calculator remembers between visits: the hero, the typed base, the
 * mode and every slot with its item's roll — in `localStorage`, under one key,
 * per browser. Nothing here is shared or addressable: a build is somebody's
 * own sandbox, and the page has a single address.
 */

export const STORAGE_KEY = 'aow5.wiki.calc';
export const DEFAULT_HERO = 'axe';

/** One item in a slot, with how this copy rolled. */
export type Entry = RollState & { id: string };

export interface CalcState {
  hero: string;
  base: Record<string, number>;
  mode: AttrMode;
  slots: Array<Entry | null>;
  neutral: Entry | null;
  pet: Entry | null;
  bag: Entry | null;
  /** A Life Soul — in the game it has a slot of its own. */
  soul: Entry | null;
  /** Runes give no panel stats; only which one is kept. */
  runes: Array<{ id: string } | null>;
}

/** Where a slot is: its kind, and its index for the two kinds that have several. */
export interface SlotRef {
  kind: SlotKind;
  i: number;
}

export function freshState(): CalcState {
  return {
    hero: DEFAULT_HERO,
    base: {},
    mode: 'delta',
    slots: Array.from({ length: 6 }, () => null),
    neutral: null,
    pet: null,
    bag: null,
    soul: null,
    runes: Array.from({ length: 3 }, () => null),
  };
}

function entry(raw: unknown): Entry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const id = (raw as { id?: unknown }).id;
  if (typeof id !== 'string' || id === '') return null;
  return { ...hydrateRollState(raw), id };
}

/** Reads a stored state, keeping whatever is well-formed. */
export function hydrate(raw: unknown): CalcState {
  const s = freshState();
  if (raw === null || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (typeof r.hero === 'string' && r.hero !== '') s.hero = r.hero;
  if (r.base !== null && typeof r.base === 'object') {
    for (const [k, v] of Object.entries(r.base as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (Number.isFinite(n)) s.base[k] = n;
    }
  }
  s.mode = r.mode === 'full' || r.attrMode === 'full' ? 'full' : 'delta';
  const slots = Array.isArray(r.slots) ? r.slots : [];
  s.slots = s.slots.map((_, i) => entry(slots[i]));
  s.neutral = entry(r.neutral);
  s.pet = entry(r.pet);
  s.bag = entry(r.bag);
  s.soul = entry(r.soul);
  const runes = Array.isArray(r.runes) ? r.runes : [];
  s.runes = s.runes.map((_, i) => {
    const id = (runes[i] as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string' && id !== '' ? { id } : null;
  });
  return s;
}

function load(): CalcState {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    return hydrate(text === null ? null : JSON.parse(text));
  } catch {
    // Private mode, blocked storage or a corrupt value: start clean.
    return freshState();
  }
}

/** The state, persisted on every change. */
export function useCalcState(): [CalcState, (update: (s: CalcState) => CalcState) => void] {
  const [state, setState] = useState<CalcState>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the page still works, it just forgets.
    }
  }, [state]);
  const update = useCallback((fn: (s: CalcState) => CalcState) => setState(fn), []);
  return [state, update];
}

/** Every item that counts towards the panel (runes do not). */
export function equipped(s: CalcState): Entry[] {
  return [...s.slots, s.neutral, s.pet, s.bag, s.soul].filter((e): e is Entry => e !== null);
}

export function getSlot(s: CalcState, ref: SlotRef): Entry | { id: string } | null {
  switch (ref.kind) {
    case 'slot':
      return s.slots[ref.i] ?? null;
    case 'rune':
      return s.runes[ref.i] ?? null;
    default:
      return s[ref.kind];
  }
}

export function setSlot(s: CalcState, ref: SlotRef, value: Entry | null): CalcState {
  switch (ref.kind) {
    case 'slot':
      return { ...s, slots: s.slots.map((e, i) => (i === ref.i ? value : e)) };
    case 'rune':
      return { ...s, runes: s.runes.map((e, i) => (i === ref.i ? (value === null ? null : { id: value.id }) : e)) };
    default:
      return { ...s, [ref.kind]: value };
  }
}

export const sameRef = (a: SlotRef | null, b: SlotRef | null): boolean => a !== null && b !== null && a.kind === b.kind && a.i === b.i;

/** Drops every manual base edit but the season levels (the player's, not the hero's). */
export function clearHeroOverrides(base: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(base)) if (k.startsWith('season_')) out[k] = v;
  return out;
}
