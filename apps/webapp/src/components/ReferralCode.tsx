import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import type { Strings } from '@/i18n/strings';
import { DEFAULT_REFERRAL, MAX_REFERRAL_CODE, normalizeReferral } from '@/lib/referral';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SlotRowLabel } from './SlotRowLabel';

interface Props {
  /** The current code. '' when erased. */
  code: string;
  strings: Strings;
  /**
   * Whose code this is, which is the only thing that differs between the three
   * places this card appears.
   *
   * `own` is the planner: your code, kept in this browser and in `?ref=`.
   * `build` is your own saved build, where it is stored with the build as well.
   * `author` is somebody else's build — the code is theirs to change and nobody
   * else's, so the field becomes a label with a copy button, which is the only
   * thing a reader wants from it anyway.
   */
  variant?: 'own' | 'build' | 'author' | undefined;
  onChange: (code: string) => void;
}

/**
 * The player's referral code, above the roster.
 *
 * Committed the way a section name is — on blur or Enter, with Escape putting
 * the old value back — so there is no save button to forget to press. Edits go
 * to `localStorage` and to `?ref=` in the URL, so the code survives both a
 * reload and being shared.
 */
export function ReferralCode({ code, strings, variant = 'own', onChange }: Props) {
  const readOnly = variant === 'author';
  const [draft, setDraft] = useState(code);
  const inputRef = useRef<HTMLInputElement>(null);

  // A code arriving from storage or the URL, or erased elsewhere, wins.
  useEffect(() => {
    setDraft(code);
  }, [code]);

  const normalized = normalizeReferral(draft);

  const commit = () => {
    if (normalized === code) return;
    onChange(normalized);
  };

  const copy = async () => {
    if (normalized === '') return;
    try {
      await navigator.clipboard.writeText(normalized);
      toast.success(strings.referralCopied, { icon: <Check className="size-4" /> });
    } catch {
      // Clipboard access is refused in plenty of contexts; select the text so
      // it can still be copied by hand.
      inputRef.current?.select();
      toast.error(strings.copyFailed);
    }
  };

  return (
    <div className="mb-4 flex flex-col items-start gap-2 rounded-lg border bg-card/50 px-3 py-2">
      <div className="flex flex-col">
        <SlotRowLabel>{readOnly ? strings.referralAuthorCode : strings.referralCode}</SlotRowLabel>
        <span className="mt-1 text-sm text-muted-foreground">
          {variant === 'author'
            ? strings.referralAuthorHint
            : variant === 'build'
              ? strings.referralBuildHint
              : strings.referralHint}
        </span>
      </div>

      <div className="flex w-full flex-wrap items-center gap-1">
        {/*
          Same type scale and height as a section name being renamed. The base
          Input carries `md:text-sm`, which would otherwise outrank a bare
          `text-2xl` from md up, so the size is restated at that breakpoint.
        */}
        <Input
          ref={inputRef}
          value={draft}
          readOnly={readOnly}
          maxLength={MAX_REFERRAL_CODE}
          // A code, not prose, so it is the same in every language.
          placeholder={DEFAULT_REFERRAL}
          aria-label={strings.referralCode}
          spellCheck={false}
          autoComplete="off"
          className={cn(
            'h-12 w-full max-w-72 text-2xl font-semibold tracking-wide uppercase md:text-2xl',
            // Reading, not filling in: no border to invite a cursor, and no
            // focus ring on a field that will not take an edit.
            readOnly && 'cursor-text border-transparent bg-transparent px-0 focus-visible:ring-0',
          )}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') setDraft(code);
          }}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 text-muted-foreground hover:text-foreground"
              disabled={normalized === ''}
              aria-label={strings.referralCopy}
              onClick={copy}
            >
              <Copy className="size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{strings.referralCopy}</TooltipContent>
        </Tooltip>

        {/* The same eraser a section card clears itself with. Absent on somebody
            else's build: there is nothing here for a reader to erase. */}
        {!readOnly && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 text-muted-foreground hover:text-foreground"
              disabled={code === '' && draft === ''}
              aria-label={strings.referralClear}
              onClick={() => {
                setDraft('');
                onChange('');
                inputRef.current?.focus();
              }}
            >
              <Eraser className="size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{strings.referralClear}</TooltipContent>
        </Tooltip>
        )}
      </div>
    </div>
  );
}
