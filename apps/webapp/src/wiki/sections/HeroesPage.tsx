import { useEffect, useMemo, useState } from 'react';
import { heroIconUrl } from 'aow5-shared/data';
import type { AbilityLocale } from 'aow5-shared/types';
import {
  CURRENT_RULESET,
  abilityText,
  heroByShort,
  heroPageFacts,
  heroRuneCount,
  type HeroesWikiFile,
  type HeroesWikiLocale,
  type ProgressionFile,
  type ProgressionLocale,
  type RuneFamily,
  type WikiAbility,
  type WikiHero,
} from 'aow5-shared/wiki';
import { Badge, Panel, cx } from '@/ui';
import { itemPath, Link, navigateTo, wikiPath } from '@/router';
import { useApp } from '@/data/AppData';
import { useItemDetailsStore } from '@/data/ItemDetailsProvider';
import { RichText } from '@/components/RichText';
import { useWikiStrings } from '../i18n';
import { HEROES, type HeroesStrings } from '../i18n/heroes';
import {
  DataFooter,
  DetailHeader,
  ItemRef,
  Note,
  Tag,
  WikiDetail,
  WikiEmpty,
  WikiError,
  WikiList,
  WikiLoading,
  WikiMissing,
  WikiRow,
  WikiShell,
  WikiSidebar,
  day,
  num,
  useWikiData,
  useWikiPageMeta,
} from '../kit';
import type { SectionProps } from '../WikiPage';
import styles from './HeroesPage.module.css';

/**
 * Heroes: each profession's abilities and the runes that empower them.
 *
 * A list and a detail, at `/wiki/heroes/<short>` (`axe`, `dragon_knight` — the
 * short id the data and `herostats.json` key by). The bare section shows the
 * first hero, as the partner wiki opened on one, but keeps the section's own
 * address and card.
 *
 * The wiki describes season 3, and a rune tier is a separate item, so every
 * tier chip is its own link to its own item page.
 */
export default function HeroesPage({ path }: SectionProps) {
  const { lang, core } = useApp();
  const t = useWikiStrings(HEROES);
  const store = useItemDetailsStore();

  // Rune descriptions are the items' own, which live in the heavy details file.
  useEffect(() => {
    store?.request();
  }, [store]);

  const { data, error } = useWikiData<[HeroesWikiFile, HeroesWikiLocale, ProgressionFile, ProgressionLocale]>([
    'heroes-wiki.json',
    'locale.{lang}.heroes-wiki.json',
    'progression.json',
    'locale.{lang}.progression.json',
  ]);

  const [q, setQ] = useState('');

  const heroId = path[0];
  const file = data?.[0];
  const locale = data?.[1];
  const selected = file === undefined ? undefined : heroId === undefined ? file.heroes[0] : heroByShort(file, heroId);
  const missing = file !== undefined && (path.length > 1 || (heroId !== undefined && selected === undefined));

  const nameOf = (hero: WikiHero): string =>
    locale?.heroes[hero.id]?.name ?? core?.heroes.byHero.get(hero.id)?.names[lang] ?? hero.short;

  const facts = useMemo(() => {
    if (heroId === undefined || selected === undefined || locale === undefined) return null;
    return heroPageFacts(selected, locale.heroes[selected.id], core?.heroes.byHero.get(selected.id)?.names[lang], lang);
  }, [heroId, selected, locale, core, lang]);
  useWikiPageMeta('heroes', path, facts, missing);

  const filtered = useMemo(() => {
    if (file === undefined) return [];
    const needle = q.trim().toLowerCase();
    if (needle === '') return file.heroes;
    return file.heroes.filter((hero) => {
      const text = locale?.heroes[hero.id];
      return `${nameOf(hero)} ${hero.id} ${hero.short} ${text?.role ?? ''} ${text?.archetype ?? ''}`.toLowerCase().includes(needle);
    });
    // `nameOf` reads `locale`, `core` and `lang`, all listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, locale, core, lang, q]);

  if (error !== null) {
    return (
      <WikiShell columns="single">
        <WikiError message={error} />
      </WikiShell>
    );
  }
  if (data === null || file === undefined || locale === undefined) {
    return (
      <WikiShell columns="single">
        <WikiLoading />
      </WikiShell>
    );
  }

  return (
    <WikiShell columns="listWide">
      <WikiSidebar
        title={t.title}
        search={{ value: q, onChange: setQ, placeholder: t.searchPlaceholder }}
        count={filtered.length > 0 ? t.count(filtered.length, file.heroes.length) : t.nothingFound}
      >
        {filtered.length === 0 ? (
          <p className={styles.emptyList}>{t.nothingFound}</p>
        ) : (
          <WikiList>
            {filtered.map((hero) => {
              const text = locale.heroes[hero.id];
              return (
                <WikiRow
                  key={hero.id}
                  href={wikiPath('heroes', hero.short)}
                  active={hero === selected}
                  icon={<HeroPortrait hero={hero} small />}
                  title={nameOf(hero)}
                  meta={[text?.role, text?.archetype, `${t.abilities(hero.abilities.length)} · ${t.runes(heroRuneCount(hero))}`]
                    .filter(Boolean)
                    .join(' · ')}
                />
              );
            })}
          </WikiList>
        )}
      </WikiSidebar>

      <WikiDetail>
        {missing ? (
          <WikiMissing />
        ) : selected === undefined ? (
          <WikiEmpty>{t.pickOne}</WikiEmpty>
        ) : (
          <HeroDetail hero={selected} name={nameOf(selected)} data={data} />
        )}
        <DataFooter ruleset={CURRENT_RULESET} built={day(file.generatedAt, lang)} />
      </WikiDetail>
    </WikiShell>
  );
}

/**
 * The hero's art: the builder's portrait, else Valve's from the Dota CDN — a
 * fallback for an id the builder's roster does not carry.
 */
function HeroPortrait({ hero, small = false }: { hero: WikiHero; small?: boolean }) {
  const { core } = useApp();
  const own = core?.heroes.byHero.get(hero.id);
  const [failed, setFailed] = useState(false);
  const src = own !== undefined ? heroIconUrl(own.icon) : `${DOTA_CDN}heroes/${hero.short}.png`;
  return (
    <span className={cx(styles.portrait, small && styles.portraitSmall)}>
      {failed ? (
        <span className={styles.portraitFallback}>{hero.short.slice(0, 2).toUpperCase()}</span>
      ) : (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

const DOTA_CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/';

function HeroDetail({
  hero,
  name,
  data,
}: {
  hero: WikiHero;
  name: string;
  data: [HeroesWikiFile, HeroesWikiLocale, ProgressionFile, ProgressionLocale];
}) {
  const { core } = useApp();
  const t = useWikiStrings(HEROES);
  const [, locale, progression, progressionLocale] = data;
  const text = locale.heroes[hero.id];

  // The builder's ability text, the second place `abilityText` looks.
  const builder = useMemo(() => {
    const out: Record<string, AbilityLocale> = {};
    for (const [id, spell] of core?.heroes.spells ?? []) out[id] = spell.text ?? { name: spell.name };
    return out;
  }, [core]);

  const treeName = progressionLocale.trees[hero.tree] ?? `${progressionLocale.heroTab}: ${name}`;
  const sub = [text?.role, text?.archetype].filter(Boolean).join(' · ');

  return (
    <>
      <DetailHeader
        icon={<HeroPortrait hero={hero} />}
        title={name}
        code={hero.id}
        tags={
          <>
            {sub !== '' && <span className={styles.sub}>{sub}</span>}
            <Tag>{t.abilities(hero.abilities.length)}</Tag>
            <Tag>{t.runes(heroRuneCount(hero))}</Tag>
            <Tag tone="accent" href={wikiPath('progression', 'heroes', hero.short)} title={t.talentTreeTitle(treeName)}>
              {t.talentTree}
            </Tag>
          </>
        }
      />

      {text?.desc !== undefined && text.desc !== '' && (
        <Panel>
          <p className={styles.heroDesc}>{text.desc}</p>
        </Panel>
      )}

      <Note>{t.note}</Note>

      <div className={styles.abilities}>
        {hero.abilities.map((ability) => (
          <AbilityBlock
            key={ability.id}
            ability={ability}
            text={abilityText(ability.id, locale, builder)}
            progression={progression}
            progressionLocale={progressionLocale}
          />
        ))}
      </div>
    </>
  );
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/**
 * Where an ability's art is: ours (`icons/abilities/…`, or `icons/abilities-wiki/…`
 * for art only the wiki extracts), else the stock Dota ability its `texture`
 * names, from Valve's CDN — nine stock abilities ship no art in the pak.
 */
function abilityIconSrc(ability: WikiAbility): string {
  return ability.icon !== undefined
    ? `${import.meta.env.BASE_URL}icons/${ability.icon}`
    : `${DOTA_CDN}abilities/${ability.texture}.png`;
}

function AbilityIcon({ ability }: { ability: WikiAbility }) {
  const t = useWikiStrings(HEROES);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={styles.abilityIconFallback} title={t.iconMissing}>
        {ability.id.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      className={styles.abilityIcon}
      src={abilityIconSrc(ability)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function AbilityBlock({
  ability,
  text,
  progression,
  progressionLocale,
}: {
  ability: WikiAbility;
  text: AbilityLocale | undefined;
  progression: ProgressionFile;
  progressionLocale: ProgressionLocale;
}) {
  const { lang, core } = useApp();
  const t = useWikiStrings(HEROES);

  const gameName = text?.name;
  const wikiName = t.wikiNames[ability.id];
  const name = wikiName ?? gameName ?? ability.id;

  const unlock = ability.unlock;
  const unlockNode =
    unlock === undefined ? undefined : progression.trees[unlock.tree]?.nodes.find((node) => node.id === unlock.node);
  const unlockTree = unlock === undefined ? '' : (progressionLocale.trees[unlock.tree] ?? progressionLocale.heroTab);

  /*
   * A family whose first tier the catalogue does not carry is not a rune a
   * player can own: the pak ships unfinished families (no name in any language,
   * not in the item index) and the gem table still lists them. Drawn, the row
   * would be a bare id with a dead card behind it.
   */
  const shownRunes = core === null ? ability.runes : ability.runes.filter((family) => core.byId.has(family.base));

  return (
    <Panel className={styles.ability}>
      <div className={styles.abilityTop}>
        <AbilityIcon ability={ability} />
        <div className={styles.abilityHead}>
          <div className={styles.nameRow}>
            <h2 className={styles.abilityName}>{name}</h2>
            {ability.slot !== null && (
              <Badge
                small
                tone="tier"
                title={ability.slot === 'passive' ? t.passiveTitle : t.slotTitle(ability.slot.toUpperCase())}
              >
                {ability.slot === 'passive' ? t.passive : ability.slot.toUpperCase()}
              </Badge>
            )}
            {ability.stub === true && (
              <Badge small tone="draft" title={t.stubTitle}>
                {t.stub}
              </Badge>
            )}
          </div>
          <div className={styles.metaRow}>
            <code className={styles.code}>{ability.id}</code>
            {wikiName !== undefined && gameName !== undefined && gameName !== wikiName && (
              <span className={styles.gameName} title={t.gameNameTitle}>
                {t.gameName(gameName)}
              </span>
            )}
          </div>
          {(ability.cd !== undefined || ability.mana !== undefined || unlock !== undefined) && (
            <div className={styles.stats}>
              {ability.cd !== undefined && <span className={styles.stat}>{t.cooldown(num(ability.cd, lang))}</span>}
              {ability.mana !== undefined && <span className={styles.stat}>{t.mana(num(ability.mana, lang))}</span>}
              {unlock !== undefined && (
                <Link
                  to={{ href: wikiPath('progression', unlock.tree, unlock.node) }}
                  className={cx(styles.stat, styles.unlock)}
                  title={t.unlockTitle(unlock.node, unlockTree, unlockNode?.level ?? 0)}
                >
                  {t.unlock(progressionLocale.nodes[unlock.node]?.name ?? unlock.node)}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {text?.desc !== undefined && text.desc.length > 0 ? (
        <div className={styles.abilityDesc}>
          <RichText nodes={text.desc} />
        </div>
      ) : text?.descPlain !== undefined && text.descPlain !== '' ? (
        <p className={styles.abilityDesc}>{text.descPlain}</p>
      ) : null}

      {shownRunes.length > 0 ? (
        <section className={styles.runes}>
          <h3 className={styles.runesTitle}>{t.runesTitle(shownRunes.length)}</h3>
          {shownRunes.map((family) => (
            <RuneRow key={family.base} family={family} t={t} />
          ))}
        </section>
      ) : ability.stub !== true ? (
        <p className={styles.noRunes}>{t.noRunes}</p>
      ) : null}
    </Panel>
  );
}

/**
 * One rune family: its art and name (the tier-I item's), the item's own
 * description, and a chip per tier — each tier is a separate item with its own
 * page. A click anywhere off the links opens the family's page, as the
 * partner's whole row did.
 */
function RuneRow({ family, t }: { family: RuneFamily; t: HeroesStrings }) {
  const { core } = useApp();
  const store = useItemDetailsStore();
  const base = core?.byId.get(family.base);
  // A tier the catalogue does not carry is an unfinished item, not a rune.
  const tiers = core === null ? family.tiers : family.tiers.filter(([id]) => core.byId.has(id));
  if (core !== null && (base === undefined || tiers.length === 0)) return null;
  // The family is named after its first tier: "Rune: Cleaving Strike I" minus the numeral.
  const name = base === undefined ? family.base : base.name.replace(/\s*[IVXⅠ-Ⅻ]+$/u, '');
  const desc = store?.detail?.[family.base];

  return (
    <div
      className={styles.rune}
      title={t.runeOpen}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a, button') !== null) return;
        navigateTo(itemPath(family.base));
      }}
    >
      <ItemRef id={family.base} bare size="sm" />
      <div className={styles.runeBody}>
        <div className={styles.runeHead}>
          <Link to={{ href: itemPath(family.base) }} className={styles.runeName}>
            {name}
          </Link>
          <span className={styles.tiers}>
            {tiers.map((tier) => {
              const [id, level] = tier;
              const tierName = core?.byId.get(id)?.name ?? id;
              return (
                <Link key={id} to={{ href: itemPath(id) }} className={styles.tier} title={t.tierOpen(tierName)}>
                  {ROMAN[level] ?? String(level)}
                </Link>
              );
            })}
          </span>
        </div>
        {desc?.desc !== undefined && desc.desc.length > 0 && (
          <div className={styles.runeDesc}>
            <RichText nodes={desc.desc} />
          </div>
        )}
      </div>
    </div>
  );
}
