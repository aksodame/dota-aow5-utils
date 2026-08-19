import { useRef } from 'react';
import { AlertTriangle, Check, Copy, Download, Link2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  MAX_SECTIONS,
  MAX_SECTION_DESC,
  MAX_SECTION_NAME,
  MIN_SECTIONS,
  SLOTS_PER_SECTION,
  createEmptyState,
  type BuildState,
} from 'aow5-shared/codec';
import { SPELLS_PER_SECTION } from 'aow5-shared/types';
import type { Strings } from '@/i18n/strings';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Past this, Discord and Steam chat start clipping pasted links. */
const LONG_LINK_CHARS = 1500;

interface Props {
  url: string;
  isEmpty: boolean;
  state: BuildState;
  strings: Strings;
  onImport: (state: BuildState) => void;
}

/**
 * Copy and export controls.
 *
 * Export exists because a full board with nine long section names approaches
 * 1,400 characters, which some chat clients truncate. A short-link service
 * would need a server, which this project deliberately does not have.
 */
export function ShareBar({ url, isEmpty, state, strings, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(strings.copied, { icon: <Check className="size-4" /> });
    } catch {
      // Clipboard access is refused in plenty of contexts; select the text so
      // it can still be copied by hand.
      urlRef.current?.select();
      toast.error(strings.copyFailed);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'aow5-build.json';
    a.click();
    URL.revokeObjectURL(href);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<BuildState>;
      const count = Array.isArray(parsed.sections) ? parsed.sections.length : 0;
      if (parsed.v !== 1 || count < MIN_SECTIONS || count > MAX_SECTIONS) throw new Error('shape');

      // Rebuild through a known-good empty state so a hand-edited file cannot
      // push a malformed board into the reducer. Every bound comes from the
      // layout constants rather than being hardcoded, so this keeps working as
      // the board shape changes.
      const next = createEmptyState(count);
      // Absent in files exported before heroes existed, which is why both are
      // read defensively rather than assumed present.
      if (typeof parsed.hero === 'string') next.hero = parsed.hero;
      if (Number.isInteger(parsed.heroUnknown)) next.heroUnknown = parsed.heroUnknown!;

      parsed.sections!.forEach((section, si) => {
        if (si >= count || !section) return;
        const target = next.sections[si]!;
        target.name = typeof section.name === 'string' ? section.name.slice(0, MAX_SECTION_NAME) : null;
        target.description =
          typeof section.description === 'string' ? section.description.slice(0, MAX_SECTION_DESC) : null;
        (section.slots ?? []).forEach((slot, vi) => {
          if (vi >= SLOTS_PER_SECTION || !slot) return;
          if (slot.k === 'id' && typeof slot.id === 'string') target.slots[vi] = { k: 'id', id: slot.id };
          else if (slot.k === 'unknown' && Number.isInteger(slot.idx)) {
            target.slots[vi] = { k: 'unknown', idx: slot.idx };
          }
        });
        (section.spells ?? []).forEach((spell, vi) => {
          if (vi >= SPELLS_PER_SECTION || !spell) return;
          if (spell.k === 'id' && typeof spell.id === 'string') target.spells[vi] = { k: 'id', id: spell.id };
          else if (spell.k === 'unknown' && Number.isInteger(spell.idx)) {
            target.spells[vi] = { k: 'unknown', idx: spell.idx };
          }
        });
      });
      onImport(next);
      toast.success(strings.importJson);
    } catch {
      toast.error(strings.importFailed);
    }
  };

  return (
    <Card className="flex-row flex-wrap items-center gap-2 p-2.5">
      <div className="relative min-w-0 flex-1 basis-72">
        <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={urlRef}
          readOnly
          value={url}
          aria-label={strings.copyLink}
          placeholder={strings.emptyBoardHint}
          onFocus={(e) => e.currentTarget.select()}
          className="pl-8 font-mono text-xs text-muted-foreground"
        />
      </div>

      <Button onClick={copy} disabled={isEmpty}>
        <Copy /> {strings.copyLink}
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={exportJson} disabled={isEmpty} aria-label={strings.exportJson}>
            <Download />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{strings.exportJson}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileRef.current?.click()}
            aria-label={strings.importJson}
          >
            <Upload />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{strings.importJson}</TooltipContent>
      </Tooltip>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importJson(file);
          e.target.value = '';
        }}
      />

      {!isEmpty && (
        <span className="flex basis-full items-center gap-1.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{strings.linkLength(url.length)}</span>
          {/*
            Descriptions are free text and go straight into the fragment, so a
            heavily annotated board can outgrow what chat clients will render.
            Warn before the link is pasted somewhere it silently truncates.
          */}
          {url.length > LONG_LINK_CHARS && (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="size-3" />
              {strings.longLinkWarning}
            </span>
          )}
        </span>
      )}
    </Card>
  );
}
