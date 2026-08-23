import { useEffect, useState } from 'react';
import type { BuildDetail } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import { getBuild } from '@/builds/api';
import type { Lang, Strings } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure } from '@/lib/api';
import { Link } from '@/router';
import { PlannerPage } from '@/routes/PlannerPage';

/**
 * One saved build.
 *
 * Fetches it, then hands it to the planner — the same planner, with every
 * picker working. There is no second read-only board renderer, which is the
 * point: two components drawing the same thing drift, and the one people spend
 * their time in is the one that stays right.
 */

type State =
  | { status: 'loading' }
  | { status: 'ready'; build: BuildDetail }
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'error' };

export function BuildPage({
  slug,
  site,
  strings,
  lang,
  onOwnershipKnown,
}: {
  slug: string;
  site: SiteStrings;
  strings: Strings;
  lang: Lang;
  /** Tells the header which list this build came from. Null until it is known. */
  onOwnershipKnown?: ((own: boolean | null) => void) | undefined;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const abort = new AbortController();
    setState({ status: 'loading' });

    getBuild(slug, abort.signal)
      .then((build) => {
        if (abort.signal.aborted) return;
        setState({ status: 'ready', build });
        onOwnershipKnown?.(build.canEdit);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        if (error instanceof ApiFailure && error.code === 'GONE') setState({ status: 'deleted' });
        else if (error instanceof ApiFailure && error.code === 'NOT_FOUND') setState({ status: 'missing' });
        else setState({ status: 'error' });
        onOwnershipKnown?.(null);
      });

    return () => abort.abort();
    // Keyed on the slug alone. `onOwnershipKnown` is a useState setter, whose
    // identity React keeps stable, so listing it would add nothing.
  }, [slug]);

  if (state.status === 'ready') {
    return (
      <PlannerPage
        // Keyed on the slug so moving between two builds rebuilds the planner
        // rather than leaving the previous board hydrated underneath.
        key={state.build.slug}
        lang={lang}
        strings={strings}
        site={site}
        build={state.build}
        onBuildChanged={(next) => setState({ status: 'ready', build: next })}
      />
    );
  }

  const message =
    state.status === 'loading'
      ? site.builds.loading
      : state.status === 'deleted'
        ? site.builds.deleted
        : state.status === 'missing'
          ? site.builds.notFound
          : site.builds.failed;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      {state.status !== 'loading' && (
        <Button variant="outline" size="sm" asChild className="mt-4">
          <Link to="builds">{site.builds.backToBuilds}</Link>
        </Button>
      )}
    </div>
  );
}
