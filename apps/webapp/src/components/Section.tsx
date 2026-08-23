import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react';
import { MAX_SECTION_DESC, MAX_SECTION_NAME, SECTION_LAYOUT, type BuildSection } from 'aow5-shared/codec';
import type { ItemSummary, SpellSummary } from 'aow5-shared/data';
import type { Strings } from '@/i18n/strings';
import type { HeroInfo } from 'aow5-shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SlotGroup } from './SlotGroup';
import { SpellRow } from './SpellRow';

/**
 * Hides the affordance for starting a new note. Descriptions stay in the model
 * and in the URL, and one that arrives through a shared link is still shown and
 * still editable — otherwise it would be visible to the sender and invisible,
 * yet un-removable, to everyone else. Flip this to bring the button back.
 */
const CAN_ADD_DESCRIPTION = false;

interface Props {
  index: number;
  section: BuildSection;
  byId: Map<string, ItemSummary>;
  /** The build's hero, or null until one is chosen. */
  hero: HeroInfo | null;
  spells: Map<string, SpellSummary>;
  strings: Strings;
  /** False for the last remaining section, which cannot be removed. */
  canRemove: boolean;
  onRename: (name: string | null) => void;
  onDescribe: (description: string | null) => void;
  onClearSection: () => void;
  onRemoveSection: () => void;
  onPickSlot: (slot: number) => void;
  onClearSlot: (slot: number) => void;
  onPickSpell: (spell: number) => void;
  onClearSpell: (spell: number) => void;
}

export function Section({
  index,
  section,
  byId,
  hero,
  spells,
  strings,
  canRemove,
  onRename,
  onDescribe,
  onClearSection,
  onRemoveSection,
  onPickSlot,
  onClearSlot,
  onPickSpell,
  onClearSpell,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const descRef = useRef<HTMLTextAreaElement>(null);

  const displayName = section.name ?? strings.defaultSection(index + 1);
  const filled = section.slots.filter(Boolean).length;
  const spellsPicked = section.spells.filter(Boolean).length;

  const lanes = useMemo(() => {
    // A hidden group still renders when it holds something, so an item that
    // arrived through a shared link is never invisible.
    const visible = SECTION_LAYOUT.filter(
      (g) =>
        !g.hidden ||
        Array.from({ length: g.count }, (_, i) => section.slots[g.start + i]).some(Boolean),
    );
    const byLane = new Map<number, { left: typeof visible; right: typeof visible }>();
    for (const group of visible) {
      const lane = byLane.get(group.lane) ?? { left: [], right: [] };
      lane[group.side].push(group);
      byLane.set(group.lane, lane);
    }
    return [...byLane.entries()].sort(([a], [b]) => a - b);
  }, [section.slots]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const openDescription = () => {
    setDescDraft(section.description ?? '');
    setEditingDesc(true);
  };

  const commitDescription = () => {
    setEditingDesc(false);
    onDescribe(descDraft.trim() === '' ? null : descDraft);
  };

  const commit = () => {
    setEditing(false);
    // An empty name falls back to the localized default and is not serialized.
    onRename(draft.trim() === '' ? null : draft);
  };

  const groupProps = { section, sectionName: displayName, byId, strings, onPickSlot, onClearSlot };

  return (
    <Card className="h-full gap-1.5 py-2">
      <CardHeader className="flex items-center gap-0.5 px-2 [.border-b]:pb-0">
        {editing ? (
          <Input
            ref={inputRef}
            value={draft}
            maxLength={MAX_SECTION_NAME}
            aria-label={strings.renameSection}
            className="h-12 text-2xl"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setDraft(section.name ?? '');
                  setEditing(true);
                }}
                className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-2xl leading-tight font-semibold hover:bg-accent"
              >
                <span className="truncate">{displayName}</span>
                <Pencil className="size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{strings.renameSection}</TooltipContent>
          </Tooltip>
        )}

        {filled > 0 && (
          <Badge variant="secondary" className="px-2 py-0 text-lg tabular-nums">
            {filled}
          </Badge>
        )}

        {CAN_ADD_DESCRIPTION && !section.description && !editingDesc && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground hover:text-foreground"
                aria-label={`${strings.addDescription}: ${displayName}`}
                onClick={openDescription}
              >
                <MessageSquarePlus className="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{strings.addDescription}</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-10 text-muted-foreground hover:text-foreground"
              disabled={
                filled === 0 && spellsPicked === 0 && section.name === null && section.description === null
              }
              aria-label={`${strings.clearSection}: ${displayName}`}
              onClick={onClearSection}
            >
              <Eraser className="size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{strings.clearSection}</TooltipContent>
        </Tooltip>

        {canRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground hover:text-destructive"
                aria-label={`${strings.removeSection}: ${displayName}`}
                onClick={onRemoveSection}
              >
                <Trash2 className="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{strings.removeSection}</TooltipContent>
          </Tooltip>
        )}
      </CardHeader>

      {(editingDesc || section.description) && (
        <div className="px-2">
          {editingDesc ? (
            <div className="space-y-1">
              <Textarea
                ref={descRef}
                value={descDraft}
                maxLength={MAX_SECTION_DESC}
                rows={2}
                placeholder={strings.descriptionPlaceholder}
                aria-label={strings.addDescription}
                className="min-h-0 resize-none py-1 text-lg"
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={commitDescription}
                onKeyDown={(e) => {
                  // Enter commits; Shift+Enter keeps the newline.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitDescription();
                  }
                  if (e.key === 'Escape') setEditingDesc(false);
                }}
              />
              <div className="text-right text-[15px] text-muted-foreground tabular-nums">
                {descDraft.length}/{MAX_SECTION_DESC}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openDescription}
              className="w-full rounded-md px-1 py-0.5 text-left text-lg whitespace-pre-wrap text-muted-foreground hover:bg-accent"
            >
              {section.description}
            </button>
          )}
        </div>
      )}

      {/*
        One row per lane: potions, then the equipment block beside the neutral
        slot, then runes beside the backpack. Every left-hand group is three
        tiles wide, so the right-hand column lines up on its own.
      */}
      <CardContent className="space-y-1 px-2">
        {/* Spells first: which abilities you take shapes what items you want. */}
        <SpellRow
          section={section}
          sectionName={displayName}
          hero={hero}
          spells={spells}
          strings={strings}
          onPickSpell={onPickSpell}
          onClearSpell={onClearSpell}
        />

        {lanes.map(([lane, groups]) => (
          <div key={lane} className="flex items-start gap-2">
            <div className="space-y-1">
              {groups.left.map((group) => (
                <SlotGroup key={group.key} group={group} {...groupProps} />
              ))}
            </div>
            {groups.right.length > 0 && (
              <div className="space-y-1">
                {groups.right.map((group) => (
                  <SlotGroup key={group.key} group={group} {...groupProps} />
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
