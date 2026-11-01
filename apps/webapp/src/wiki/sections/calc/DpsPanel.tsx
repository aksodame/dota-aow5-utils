import { useMemo, useState } from 'react';
import {
  ACTIVE_ITEM_IDS,
  WAVE60_BOSS,
  analyzeDps,
  type DpsBuild,
  type DpsEnemy,
  type DpsResult,
  type EnemyKind,
} from 'aow5-shared/wiki';
import { Button, Panel, Select } from '@/ui';
import type { Lang } from '@/i18n/strings';
import { num } from '../../kit';
import type { DpsStrings } from '../../i18n/calc';
import type { CalcState } from './state';
import styles from './DpsPanel.module.css';

/**
 * The DPS sub-tab: a target form on the left, the window's result and its
 * source bars on the right. The numbers come from the same panel the stats tab
 * shows; `buildDpsInput` is the bridge.
 */
export function DpsPanel({
  t,
  lang,
  state,
  update,
  build,
}: {
  t: DpsStrings;
  lang: Lang;
  state: CalcState;
  update: (fn: (s: CalcState) => CalcState) => void;
  build: DpsBuild;
}) {
  const enemy = state.dps.enemy;
  const activeItems = useMemo(
    () => build.items.filter((item) => ACTIVE_ITEM_IDS.has(item.id)),
    [build.items],
  );
  const isActive = (id: string): boolean =>
    state.dps.active[id] ??
    (id === 'item_0152' || id === 'item_0155' || id === 'item_0317' || id === 'item_0305' || id === 'item_0289' || id === 'item_0225' || id === 'item_0703');
  const activeIds = useMemo(
    () => new Set(activeItems.filter((item) => isActive(item.id)).map((item) => item.id)),
    [activeItems, state.dps.active],
  );
  const result = useMemo(
    () => analyzeDps(build, enemy, state.dps.duration, activeIds),
    [build, enemy, state.dps.duration, activeIds],
  );
  const setActive = (id: string, on: boolean) =>
    update((s) => ({ ...s, dps: { ...s.dps, active: { ...s.dps.active, [id]: on } } }));
  const window = result.window;
  const kill = result.kill;
  const maxDamage = window.sources[0]?.damage ?? 0;
  const seconds = lang === 'ru' ? 'с' : lang === 'zh' ? '秒' : 's';

  const setEnemy = (key: keyof DpsEnemy, value: number | EnemyKind) =>
    update((s) => ({ ...s, dps: { ...s.dps, enemy: { ...s.dps.enemy, [key]: value } } }));
  const setNumber = (key: keyof DpsEnemy, text: string) => {
    const parsed = Number(text.replace(',', '.'));
    const value = Number.isFinite(parsed) ? parsed : 0;
    if (key === 'maxHp') setEnemy(key, Math.max(1, value));
    else if (key === 'healthRegen' || key === 'damageResistancePct') setEnemy(key, Math.max(0, value));
    else setEnemy(key, value);
  };
  const field = (key: keyof DpsEnemy, label: string, step = '1') => (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        className={styles.input}
        type="number"
        inputMode="decimal"
        step={step}
        value={String(enemy[key])}
        onChange={(event) => setNumber(key, event.target.value)}
      />
    </label>
  );

  return (
    <Panel title={t.title} className={styles.panel}>
      <p className={styles.note}>{t.note}</p>
      <div className={styles.layout}>
        <section className={styles.target}>
          <h3 className={styles.heading}>{t.enemy.title}</h3>
          <div className={styles.presets}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update((s) => ({ ...s, dps: { ...s.dps, enemy: { ...WAVE60_BOSS } } }))}
            >
              {t.enemy.presetBoss}
            </Button>
            <span className={styles.presetNote}>{t.enemy.custom}</span>
          </div>
          <label className={styles.field}>
            <span>{t.enemy.kind}</span>
            <Select value={enemy.kind} onChange={(event) => setEnemy('kind', event.target.value as EnemyKind)}>
              {(['normal', 'elite', 'miniboss', 'boss'] as EnemyKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {t.enemy.kinds[kind]}
                </option>
              ))}
            </Select>
          </label>
          {field('maxHp', t.enemy.maxHp)}
          {field('armor', t.enemy.armor)}
          {field('magicResistancePct', t.enemy.magicResistance)}
          {field('healthRegen', t.enemy.healthRegen, '0.1')}
          {field('damageReductionPct', t.enemy.damageReduction)}
          {field('damageResistancePct', t.enemy.damageResistance)}
          {field('physicalDamageIncreasePct', t.enemy.physicalIncrease)}
          <label className={styles.field}>
            <span>{t.enemy.duration}</span>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={3600}
              step={1}
              value={String(state.dps.duration)}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                const duration = Number.isFinite(parsed) ? Math.min(3600, Math.max(1, parsed)) : 1;
                update((s) => ({ ...s, dps: { ...s.dps, duration } }));
              }}
            />
          </label>
          <p className={styles.hint}>{t.enemy.durationHint}</p>

          {activeItems.length > 0 && (
            <div className={styles.activeBox}>
              <h3 className={styles.heading}>{t.active.title}</h3>
              <p className={styles.hint}>{t.active.note}</p>
              {activeItems.map((item) => (
                <label key={item.id} className={styles.activeRow}>
                  <input
                    type="checkbox"
                    checked={isActive(item.id)}
                    onChange={(event) => setActive(item.id, event.target.checked)}
                  />
                  <span>
                    <b>
                      {item.id === 'item_0152'
                        ? t.active.phase
                        : item.id === 'item_0155'
                          ? t.active.madness
                          : item.id === 'item_0317'
                            ? t.active.shadowMask
                            : item.id === 'item_0305'
                              ? t.active.shatteredAxe
                              : item.id === 'item_0289'
                                ? t.active.viciousHorn
                                : item.id === 'item_0225'
                                  ? t.active.vanguard
                                  : item.id === 'item_0703'
                                    ? t.active.vanguardAncestor
                                    : item.id === 'item_0332'
                                      ? t.active.bloodRite
                                      : item.id === 'item_0715'
                                        ? t.active.bloodRiteAncestor
                                        : item.id === 'item_0255'
                                          ? t.active.legionShield
                                          : item.id === 'item_0707'
                                            ? t.active.legionShieldAncestor
                                            : item.id === 'item_0827'
                                          ? t.active.featherAncestor
                                          : t.active.feather}
                    </b>
                    <small>
                      {item.id === 'item_0152'
                        ? t.active.phaseMeta(num(item.cooldown, lang, 0), num(item.stats.ability_phase_duration, lang, 0))
                        : item.id === 'item_0155'
                          ? t.active.madnessMeta(num(item.cooldown, lang, 0), num(item.stats.ability_duration, lang, 0))
                          : item.id === 'item_0317'
                            ? t.active.shadowMaskMeta(num(item.cooldown, lang, 0), num(item.stats.ability_duration, lang, 0))
                            : item.id === 'item_0305'
                              ? t.active.shatteredAxeMeta(num(item.cooldown, lang, 0), num(item.stats.ability_duration, lang, 0))
                              : item.id === 'item_0289'
                                ? t.active.viciousHornMeta(num(item.cooldown, lang, 0), num(item.stats.ability_duration, lang, 0))
                                : item.id === 'item_0225' || item.id === 'item_0703'
                                  ? t.active.vanguardMeta(
                                      num(item.cooldown, lang, 0),
                                      num(item.stats.ability_duration, lang, 0),
                                      num(item.stats.ability_value_shield_amount, lang, 0),
                                      num(item.stats.ability_value_max_health_pct, lang, 0),
                                      num(item.stats.ability_self_movespeed_pct, lang, 0),
                                    )
                                  : item.id === 'item_0332' || item.id === 'item_0715'
                                    ? t.active.bloodRiteMeta(
                                        num(item.cooldown, lang, 0),
                                        num(item.stats.ability_value_duration, lang, 0),
                                      )
                                    : item.id === 'item_0255' || item.id === 'item_0707'
                                      ? t.active.legionShieldMeta(
                                          num(item.cooldown, lang, 0),
                                          num(item.stats.ability_duration, lang, 0),
                                          num(item.stats.ability_value_shield_amount, lang, 0),
                                          num(item.stats.ability_self_movespeed, lang, 0),
                                        )
                                      : t.active.meta(
                                          num(item.cooldown, lang, 0),
                                          num(item.stats.ability_duration, lang, 0),
                                          num(item.stats.ability_interval, lang, 0),
                                          num(item.stats.ability_all_stats_damage_pct, lang, 0),
                                        )}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className={styles.results}>
          <h3 className={styles.heading}>{t.summary.title}</h3>
          <div className={styles.cards}>
            <Card label={t.summary.windowDps} value={num(window.dps, lang, 0)} />
            <Card label={t.summary.windowDamage} value={num(window.damage, lang, 0)} />
            <Card
              label={t.summary.ttk}
              value={kill.ttk !== null ? `${num(kill.ttk, lang, 2)} ${seconds}` : t.summary.ttkNone}
            />
            <Card label={t.summary.killAttacks} value={kill.ttk !== null ? num(kill.attacks, lang, 0) : '—'} />
            <Card
              label={t.summary.killDamage}
              value={kill.ttk !== null ? num(Math.min(kill.damage, enemy.maxHp), lang, 0) : '—'}
            />
            <Card label={t.summary.attacks} value={num(window.attacks, lang, 0)} />
            <Card label={t.summary.attackSpeed} value={num(window.attackSpeed, lang, 1)} />
            <Card label={t.summary.aps} value={num(window.attacksPerSecond, lang, 2)} />
            <Card label={t.summary.critChance} value={`${num(window.critChancePct, lang, 1)} %`} />
            <Card label={t.summary.critMultiplier} value={`×${num(window.critMultiplier, lang, 2)}`} />
            <Card label={t.summary.armorBreak} value={num(window.armorAfterBreak, lang, 1)} />
            <Card label={t.summary.armor} value={num(window.armorAfterPen, lang, 1)} />
            <Card label={t.summary.penetration} value={`${num(build.armorPenetrationPct, lang, 1)} %`} />
            <Card label={t.summary.poisonStacks} value={num(window.poisonStacks, lang, 1)} />
            <Card label={t.summary.doomStacks} value={num(window.doomStacks, lang, 1)} />
          </div>

          <h3 className={styles.heading}>{t.sources.title}</h3>
          {window.sources.length === 0 ? (
            <p className={styles.hint}>{t.summary.noItems}</p>
          ) : (
            <div className={styles.bars}>
              {window.sources.map((source) => (
                <SourceBar
                  key={source.id}
                  t={t}
                  lang={lang}
                  source={source}
                  max={maxDamage}
                  total={window.damage}
                  duration={window.duration}
                />
              ))}
            </div>
          )}

          <Timeline t={t} lang={lang} window={window} kill={kill} />
        </section>
      </div>

      <div className={styles.notes}>
        <h3 className={styles.heading}>{t.notes.title}</h3>
        <ul>
          {t.notes.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function Timeline({
  t,
  lang,
  window,
  kill,
}: {
  t: DpsStrings;
  lang: Lang;
  window: DpsResult;
  kill: DpsResult;
}) {
  const [view, setView] = useState<'window' | 'kill'>('window');
  const maxDps = Math.max(1, ...window.timeline.map((point) => point.dps));
  const shown = kill.events.slice(0, 30);

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineHead}>
        <h3 className={styles.heading}>{t.timeline.title}</h3>
        <div className={styles.viewTabs} role="tablist" aria-label={t.timeline.title}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'window'}
            className={view === 'window' ? styles.viewTabActive : styles.viewTab}
            onClick={() => setView('window')}
          >
            {t.timeline.windowTab}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'kill'}
            className={view === 'kill' ? styles.viewTabActive : styles.viewTab}
            onClick={() => setView('kill')}
          >
            {t.timeline.killTab}
          </button>
        </div>
      </div>

      {view === 'window' ? (
        <>
          <div className={styles.chart} role="img" aria-label={`${t.timeline.windowTab}: ${t.timeline.damage}`}>
            {window.timeline.map((point) => (
              <div
                key={point.second}
                className={styles.barCol}
                title={`${point.second} ${lang === 'ru' ? 'с' : lang === 'zh' ? '秒' : 's'}: ${num(point.dps, lang, 0)} DPS`}
              >
                <div className={styles.bar} style={{ height: `${(point.dps / maxDps) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className={styles.axis}>
            <span>1</span>
            <span>{window.timeline.length}</span>
          </div>
        </>
      ) : shown.length === 0 ? (
        <p className={styles.hint}>{t.timeline.empty}</p>
      ) : (
        <>
          <div className={styles.events}>
            <table>
              <thead>
                <tr>
                  <th>{t.timeline.time}</th>
                  <th>{t.timeline.source}</th>
                  <th>{t.timeline.damage}</th>
                  <th>{t.timeline.hp}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((event, i) => (
                  <tr key={`${event.time}-${event.source}-${i}`}>
                    <td>{num(event.time, lang, 2)}</td>
                    <td>{t.sources.labels[event.source]}</td>
                    <td>{num(event.damage, lang, 0)}</td>
                    <td>{num(event.hp, lang, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {kill.events.length > shown.length && <p className={styles.hint}>{t.timeline.firstOnly}</p>}
        </>
      )}
      <p className={styles.hint}>{t.timeline.note}</p>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.card}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function SourceBar({
  t,
  lang,
  source,
  max,
  total,
  duration,
}: {
  t: DpsStrings;
  lang: Lang;
  source: DpsResult['sources'][number];
  max: number;
  total: number;
  duration: number;
}) {
  const share = total > 0 ? (source.damage / total) * 100 : 0;
  const width = max > 0 ? (source.damage / max) * 100 : 0;
  return (
    <div className={styles.source}>
      <div className={styles.sourceHead}>
        <span>{t.sources.labels[source.id]}</span>
        <span className={styles.sourceNumbers}>
          {num(share, lang, 1)} % · {num(source.damage, lang, 0)} · {num(duration > 0 ? source.damage / duration : 0, lang, 0)} DPS
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${Math.max(0.5, width)}%` }} />
      </div>
    </div>
  );
}
