import { Reveal } from '@/components/fx/Reveal';
import { Button } from '@/components/ui/button';
import type { Lang } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { Link } from '@/router';
import { cn } from '@/lib/utils';
import { BoardPreview } from './landing/BoardPreview';
import { HudPreview } from './tracker/HudPreview';

/**
 * The front page: what the two tools are, and which of them you want.
 *
 * No in-page `#anchors` anywhere on it — the fragment belongs to the planner's
 * share links, and a stray one following someone onto `/builder` would be
 * decoded as a board and reported as a broken one. Everything links to a route.
 */

/**
 * One tool: what it is, what it does, how to get it, and a look at it.
 *
 * Both get the same shape because they are the same kind of claim, and
 * alternating which side the preview sits on is the only thing that stops the
 * second from reading as a repeat of the first. Narrow screens stack them
 * words-first: that is what someone scrolling needs.
 */
function Tool({
  kicker,
  title,
  lead,
  features,
  note,
  action,
  preview,
  mirrored,
  heading: Heading = 'h2',
}: {
  kicker: string;
  title: string;
  lead: string;
  features: string[];
  note: string;
  action: React.ReactNode;
  preview: React.ReactNode;
  mirrored?: boolean;
  /** The first section on the page carries the page's `h1`. */
  heading?: 'h1' | 'h2';
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn('flex flex-col gap-5', mirrored && 'lg:order-2')}>
          <Reveal>
            <p className="text-xs font-medium tracking-widest text-primary uppercase">{kicker}</p>
            <Heading className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</Heading>
          </Reveal>

          <Reveal index={1}>
            <p className="text-pretty text-muted-foreground">{lead}</p>
          </Reveal>

          <Reveal index={2}>
            <ul className="flex flex-col gap-2.5">
              {features.map((feature) => (
                <li key={feature} className="flex gap-3 text-sm">
                  <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span className="text-pretty">{feature}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal index={3} className="flex flex-col items-start gap-2">
            {action}
            <p className="text-xs text-muted-foreground">{note}</p>
          </Reveal>
        </div>

        <Reveal
          index={2}
          className={cn('flex justify-center lg:justify-end', mirrored && 'lg:order-1 lg:justify-start')}
        >
          {preview}
        </Reveal>
      </div>
    </section>
  );
}

export function LandingPage({ site, lang }: { site: SiteStrings; lang: Lang }) {
  const t = site.landing;

  return (
    <>
      <Tool
        heading="h1"
        kicker={t.planner.kicker}
        title={t.planner.title}
        lead={t.planner.lead}
        features={t.planner.features}
        note={t.planner.note}
        preview={
          <figure className="w-fit">
            <BoardPreview site={site} lang={lang} />
            <figcaption className="mt-2 max-w-sm text-xs text-muted-foreground">
              {site.preview.plannerCaption}
            </figcaption>
          </figure>
        }
        action={
          <Button size="lg" asChild>
            <Link to="planner">{t.planner.cta}</Link>
          </Button>
        }
      />

      <Tool
        mirrored
        kicker={t.tracker.kicker}
        title={t.tracker.title}
        lead={t.tracker.lead}
        features={t.tracker.features}
        note={t.tracker.note}
        preview={<HudPreview site={site} lang={lang} />}
        action={
          <Button size="lg" asChild>
            <Link to="tracker">{t.tracker.cta}</Link>
          </Button>
        }
      />
    </>
  );
}
