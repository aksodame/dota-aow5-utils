import { Button } from '@/components/ui/button';
import type { Lang } from '@/i18n/strings';
import type { SiteStrings } from '@/i18n/site';
import { RELEASES_URL } from '@/lib/links';
import { formatDate, megabytes, useLatestRelease } from '@/lib/release';

/**
 * The tracker's download, and what it is.
 *
 * Four states, and every one of them is a working link to
 * `github.com/aksodame/dota-aow5-utils/releases`. Only when an asset is
 * actually found does the button become a direct download — which is also the
 * only moment it can honestly claim a version and a size.
 *
 * "No release yet" is not an error and is not hidden: the button still goes to
 * the releases page, and the line under it says why there is nothing there.
 */
export function DownloadButton({ site, lang }: { site: SiteStrings; lang: Lang }) {
  const state = useLatestRelease();
  const t = site.download;

  // Not an error, and not hidden: there is genuinely nothing published yet.
  // It points at the releases page rather than at the source, because the page
  // already offers "build it from source" right underneath — and because the
  // releases page is where the answer will appear without this page changing.
  if (state.status === 'none') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button variant="outline" size="lg" asChild>
          <a href={RELEASES_URL} target="_blank" rel="noreferrer noopener">
            {t.allReleases}
          </a>
        </Button>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t.none}. {t.noneHint}
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button variant="outline" size="lg" asChild>
          <a href={RELEASES_URL} target="_blank" rel="noreferrer noopener">
            {t.allReleases}
          </a>
        </Button>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t.error}. {t.errorHint}
        </p>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-start gap-2">
        {/* A link, not a disabled button: the releases page is a fine answer
            already, and a dead control while a request is in flight is not.
            The line underneath says a request is in flight; a spinner would
            only be a second way of saying it. */}
        <Button size="lg" asChild>
          <a href={RELEASES_URL} target="_blank" rel="noreferrer noopener">
            {t.label}
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">{t.checking}</p>
      </div>
    );
  }

  const { release } = state;
  const published = release.publishedAt ? formatDate(release.publishedAt, lang) : null;
  const details = [
    t.version(release.tag),
    release.asset ? t.size(megabytes(release.asset.sizeBytes)) : null,
    published ? t.published(published) : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" asChild>
          {/* No `target`: a file download that opens a tab leaves an empty one
              behind. The release page link beside it is the one that opens. */}
          <a href={release.asset?.url ?? release.url} rel="noreferrer noopener">
            {t.label}
          </a>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={release.url} target="_blank" rel="noreferrer noopener">
            {t.allReleases}
          </a>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{details.join(' · ')}</p>
    </div>
  );
}
