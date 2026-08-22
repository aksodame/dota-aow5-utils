import { GithubMark } from '@/components/GithubMark';
import type { SiteStrings } from '@/i18n/site';
import { REPO_URL, WORKSHOP_URL } from '@/lib/links';

const linkClass =
  'inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline';

export function SiteFooter({ site }: { site: SiteStrings }) {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a href={WORKSHOP_URL} target="_blank" rel="noreferrer noopener" className={linkClass}>
            {site.footer.workshop}
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={site.footer.source}
            title={site.footer.source}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <GithubMark />
          </a>
          <span className="text-sm text-muted-foreground">{site.footer.builtWith}</span>
        </div>

        {/* The attribution is the point of the footer, not small print under
            it: these tools render someone else's art and someone else's data,
            and say so on every page that shows any of it — which, now that the
            planner and the landing are one site, means the footer rather than
            the planner. */}
        <p className="max-w-3xl text-xs text-pretty text-muted-foreground">{site.footer.attribution}</p>
      </div>
    </footer>
  );
}
