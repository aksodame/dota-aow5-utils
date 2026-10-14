import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ancientPrice,
  exchangePoints,
  refreshSeconds,
  regularPoolAt,
  regularPrice,
  talentKeys,
  guildOrderRows,
  vendorAddress,
  vendorPageFacts,
  vendorPaths,
  type GuildOrdersFile,
  type VendorsFile,
  type VendorsLocale,
} from './vendors.ts';

/** Vendor pricing and stock helpers, against the emitted `wiki/vendors.json`. */

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const vendors = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/vendors.json'), 'utf8')) as VendorsFile;

test('regular prices are floored multiples of cost', () => {
  assert.deepEqual(regularPrice(15), { min: 22, max: 52 });
  assert.deepEqual(regularPrice(3000, true), { min: 4500, max: 10500, precious: 15750 });
});

test('ancient prices are a fifth of the gold price', () => {
  assert.deepEqual(ancientPrice(8000), { coinMin: 2400, coinMax: 5600, sellGold: 4000 });
});

test('exchange points: formula, cap and manual override', () => {
  assert.equal(exchangePoints('item_M403', 3000, 5), 42);
  assert.equal(exchangePoints('item_X', 10_000_000, 6), 800);
  assert.equal(exchangePoints('item_M318', 600, 4), 500);
});

test('refresh shortens with shop_time, capped', () => {
  const r = vendors.regular.refresh;
  assert.equal(refreshSeconds(r, 0), r.baseSec);
  assert.equal(refreshSeconds(r, 999), Math.floor((r.baseSec * (100 - r.maxReductionPct)) / 100));
});

test('the shop pool grows with level and holds every precious item', () => {
  const l1 = regularPoolAt(vendors.regular, 1);
  const l10 = regularPoolAt(vendors.regular, 10);
  assert.ok(l1.length > 0 && l10.length > l1.length);
  const all = new Set(l10);
  for (const id of vendors.regular.precious) assert.ok(all.has(id), id);
});

test('each vendor names its talent keys', () => {
  assert.ok(talentKeys(vendors.regular.talents).includes('shop_level'));
  assert.ok(talentKeys(vendors.ancient.talents).includes('ancient_shop_count'));
  assert.deepEqual(talentKeys(vendors.guild.talents), ['merchant_daily_task_reward_bonus']);
});

test('exchange offers carry positive stock', () => {
  for (const [, stock] of vendors.guild.exchange.offers) assert.ok(stock > 0);
});

const orders = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/guild-orders.json'), 'utf8')) as GuildOrdersFile;

test('guild order rows: the partner snapshot, one row per level', () => {
  assert.equal(orders.version, 'v1.507');
  const all = guildOrderRows(orders);
  assert.equal(all.length, 217);
  assert.deepEqual([...new Set(all.map((r) => r.level))], [1, 2, 3, 4]);
  for (const r of all) assert.ok(r.needMin >= 1 && r.needMax >= r.needMin, r.id);
  assert.ok(guildOrderRows(orders, 4).every((r) => r.level === 4));
});

test('vendor addresses: bare is regular, bare guild is its orders, the rest names nothing', () => {
  assert.deepEqual(vendorAddress([]), { vendor: 'regular' });
  assert.deepEqual(vendorAddress(['ancient']), { vendor: 'ancient' });
  assert.deepEqual(vendorAddress(['guild']), { vendor: 'guild', guild: 'tasks' });
  assert.deepEqual(vendorAddress(['guild', 'exchange']), { vendor: 'guild', guild: 'exchange' });
  assert.equal(vendorAddress(['guild', 'shop']), undefined);
  assert.equal(vendorAddress(['regular', 'x']), undefined);
  assert.equal(vendorAddress(['nobody']), undefined);
  for (const p of vendorPaths()) assert.ok(vendorAddress(p), p.join('/'));
});

test('vendor page facts name the currency, the restock and the stock in every language', () => {
  for (const lang of ['en', 'ru', 'zh'] as const) {
    const locale = JSON.parse(fs.readFileSync(path.join(ROOT, `public/data/wiki/locale.${lang}.vendors.json`), 'utf8')) as VendorsLocale;
    for (const p of vendorPaths()) {
      const f = vendorPageFacts(vendors, locale, vendorAddress(p)!, lang);
      assert.ok(f.name.length > 0 && f.facts.length > 0 && f.description.length > 0, `${lang} ${p.join('/')}`);
      assert.ok(!f.facts.includes('{'), f.facts);
    }
  }
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/wiki/locale.en.vendors.json'), 'utf8')) as VendorsLocale;
  assert.match(vendorPageFacts(vendors, en, { vendor: 'regular' }, 'en').facts, /^Gold · restocks every 30 min · /);
});
