import { Reveal } from '@/components/fx/Reveal';
import type { Lang } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { DownloadButton } from './tracker/DownloadButton';
import { HudPreview } from './tracker/HudPreview';

/**
 * The tracker's page, at `/tracker`.
 *
 * The tracker is a desktop app in a different workspace package, so this page
 * cannot *be* it — what it can do is show it accurately and hand over the
 * download. What it looks like, then the download, then the panels it opens,
 * how to fit it over the game, and how to point it at a real one.
 */

function Panel({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-pretty text-sm text-muted-foreground">{lead}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Definitions({ items }: { items: { name: string; text: string }[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((entry) => (
        <div key={entry.name} className="rounded-lg border bg-background/60 p-4">
          <dt className="text-sm font-medium">{entry.name}</dt>
          <dd className="mt-1 text-sm text-pretty text-muted-foreground">{entry.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TrackerPage({ site, lang }: { site: SiteStrings; lang: Lang }) {
  const t = site.tracker;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 sm:py-20">
      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col gap-5">
          <Reveal>
            <p className="text-xs font-medium tracking-widest text-primary uppercase">{t.kicker}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{t.title}</h1>
          </Reveal>

          <Reveal index={1}>
            <p className="text-pretty text-muted-foreground">{t.lead}</p>
          </Reveal>

          <Reveal index={2}>
            <DownloadButton site={site} lang={lang} />
          </Reveal>
        </div>

        <Reveal index={2} className="flex justify-center lg:justify-end">
          <HudPreview site={site} lang={lang} />
        </Reveal>
      </div>

      <Panel title={t.windows.title} lead={t.windows.lead}>
        <Definitions items={t.windows.items} />
      </Panel>

      <Panel title={t.fitting.title} lead={t.fitting.lead}>
        <Definitions items={t.fitting.items} />
      </Panel>

      <Panel title={t.pricing.title}>
        <p className="max-w-2xl text-pretty text-sm text-muted-foreground">{t.pricing.text}</p>
      </Panel>

      <Panel title={t.setup.title} lead={t.setup.lead}>
        <ol className="flex flex-col gap-3">
          {t.setup.steps.map((step, i) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              <span className="text-pretty">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">{t.setup.note}</p>
      </Panel>

      <Panel title={t.privacy.title}>
        <p className="max-w-2xl text-pretty text-sm text-muted-foreground">{t.privacy.text}</p>
      </Panel>
    </div>
  );
}
