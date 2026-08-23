import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MAX_BUILDS_PER_USER, type BuildSummary } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import { deleteBuild, myBuilds, updateBuild } from '@/builds/api';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure } from '@/lib/api';
import { setMe, useMe } from '@/auth/useMe';
import { BuildLink } from '@/builds/BuildLink';

/**
 * The author's own five.
 *
 * Shows drafts as well as published builds, because the cap counts both — a
 * page that hid drafts would leave somebody staring at "five of five" with
 * three builds visible.
 */
export function MyBuildsPage({ site }: { site: SiteStrings }) {
  const me = useMe();
  const [builds, setGuides] = useState<BuildSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const t = site.builds;

  const reload = useCallback(() => {
    myBuilds()
      .then((rows) => {
        setGuides(rows);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (me.status === 'ready' && me.user !== null) reload();
  }, [me.status, me.status === 'ready' ? me.user?.id : null, reload]);

  if (me.status === 'loading') return <Centered>{t.loading}</Centered>;

  // Reachable only by typing the address — the nav entry is not shown signed
  // out. It says where the door is rather than being a second one.
  if (me.user === null) {
    return <Centered>{t.mineSignedOut}</Centered>;
  }

  async function act(run: () => Promise<unknown>, delta = 0) {
    try {
      await run();
      reload();
      if (delta !== 0 && me.status === 'ready' && me.user !== null) {
        setMe({ ...me.user, buildCount: me.user.buildCount + delta });
      }
    } catch (error) {
      toast.error(error instanceof ApiFailure ? error.message : t.failed);
    }
  }

  const used = builds?.length ?? me.user.buildCount;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-16">
      <h1 className="text-2xl font-extrabold tracking-tight">{t.mineTitle}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t.mineLead}</p>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        {t.slotsUsed.replace('{n}', String(used)).replace('{max}', String(MAX_BUILDS_PER_USER))}
      </p>

      {failed && <p className="mt-6 text-muted-foreground">{t.failed}</p>}
      {builds !== null && builds.length === 0 && <p className="mt-6 text-muted-foreground">{t.mineEmpty}</p>}

      <ul className="mt-6 space-y-3">
        {builds?.map((build) => (
          <li key={build.slug} className="rounded-xl border bg-card p-4 text-card-foreground">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <BuildLink slug={build.slug} className="font-medium break-words hover:underline">
                  {build.title}
                </BuildLink>
                <p className="mt-1 text-xs text-muted-foreground">
                  {build.status === 'draft' && (
                    <span className="mr-2 rounded-full bg-secondary px-2 py-0.5">{t.draft}</span>
                  )}
                  <span className="tabular-nums">
                    {build.likeCount} / {build.dislikeCount} · {build.commentCount}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void act(() =>
                      updateBuild(build.slug, { status: build.status === 'draft' ? 'published' : 'draft' }),
                    )
                  }
                >
                  {build.status === 'draft' ? t.publishAction : t.unpublish}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // A published build's link is in other people's chat logs,
                    // so this asks first — and says what it costs them, not what
                    // it costs you.
                    if (window.confirm(t.deleteConfirm)) {
                      void act(() => deleteBuild(build.slug), -1);
                    }
                  }}
                >
                  {t.delete}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-16 text-center">{children}</div>;
}
