import { useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import type { BuildDetail } from 'aow5-api-contract';
import { Button } from '@/components/ui/button';
import { useMe } from '@/auth/useMe';
import type { SiteStrings } from '@/i18n/site';
import { ApiFailure, api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VoteResponse {
  value: 1 | -1 | 0;
  likeCount: number;
  dislikeCount: number;
}

/**
 * Liking or disliking a build.
 *
 * Optimistic, and rolled back on failure. A vote is one click and the answer is
 * a small number changing; waiting for a round trip to move it makes the button
 * feel broken, and the failure case is rare enough to be worth the rollback.
 *
 * Pressing the button you already pressed withdraws the vote — which is what
 * `value: 0` means to the API, and why it is a PUT rather than a POST.
 */
export function VoteButtons({ build, site }: { build: BuildDetail; site: SiteStrings }) {
  const me = useMe();
  const [vote, setVote] = useState<1 | -1 | 0>(build.myVote);
  const [counts, setCounts] = useState({ up: build.likeCount, down: build.dislikeCount });
  const [busy, setBusy] = useState(false);

  const signedIn = me.status === 'ready' && me.user !== null;
  const isAuthor = me.status === 'ready' && me.user?.id === build.author.id;

  async function send(next: 1 | -1) {
    const value: 1 | -1 | 0 = vote === next ? 0 : next;

    const previous = { vote, counts };
    setVote(value);
    setCounts({
      up: counts.up + (value === 1 ? 1 : 0) - (vote === 1 ? 1 : 0),
      down: counts.down + (value === -1 ? 1 : 0) - (vote === -1 ? 1 : 0),
    });

    setBusy(true);
    try {
      const result = await api<VoteResponse>(`/builds/${encodeURIComponent(build.slug)}/vote`, {
        method: 'PUT',
        body: { value },
      });
      // The server's numbers win: somebody else may have voted in between.
      setVote(result.value);
      setCounts({ up: result.likeCount, down: result.dislikeCount });
    } catch (error) {
      setVote(previous.vote);
      setCounts(previous.counts);
      toast.error(error instanceof ApiFailure ? error.message : site.builds.failed);
    } finally {
      setBusy(false);
    }
  }

  // Signed out, this is a readout rather than a control. No prompt: the header
  // is the one place on the site that asks for an account.
  if (!signedIn) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1 tabular-nums">
          <ThumbsUp className="size-4" aria-hidden /> {counts.up}
        </span>
        <span className="flex items-center gap-1 tabular-nums">
          <ThumbsDown className="size-4" aria-hidden /> {counts.down}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={vote === 1}
        disabled={busy || isAuthor}
        title={isAuthor ? site.builds.selfVote : undefined}
        className={cn(vote === 1 && 'border-primary text-primary')}
        onClick={() => void send(1)}
      >
        <ThumbsUp />
        <span className="tabular-nums">{counts.up}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={vote === -1}
        disabled={busy || isAuthor}
        className={cn(vote === -1 && 'border-destructive text-destructive')}
        onClick={() => void send(-1)}
      >
        <ThumbsDown />
        <span className="tabular-nums">{counts.down}</span>
      </Button>
    </div>
  );
}
