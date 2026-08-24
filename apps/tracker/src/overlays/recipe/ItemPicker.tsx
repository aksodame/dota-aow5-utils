import { useMemo, useState } from 'react';
import { Hammer, Package, Plus } from 'lucide-react';
import { iconUrl, qualityColor } from '@core/items.ts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useItems } from '@/features/items/table';
import { useMessages } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Picks the next thing to collect toward.
 *
 * Two modes on one search, because the panel counts two kinds of thing and the
 * player is not thinking about the difference: a recipe, which expands into the
 * ingredients it costs, and a plain item, which is simply "I want thirty of
 * these". Recipes are the default — they are the reason the panel exists — and
 * the toggle is right there because the moment you want the other one, you
 * want it immediately.
 */

interface Props {
  /** Has a recipe. Null-safe: false while the graph is still loading. */
  craftable: (id: string) => boolean;
  /** Graph still loading — recipes cannot be told from plain items yet. */
  loading: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}

/** Enough to choose from without becoming a catalogue to scroll. */
const MAX_RESULTS = 7;

export function ItemPicker({ craftable, loading, onPick, onCancel }: Props) {
  const m = useMessages();
  const itemTable = useItems();
  const [query, setQuery] = useState('');
  const [recipesOnly, setRecipesOnly] = useState(true);

  const results = useMemo(() => {
    const text = query.trim();
    if (text === '') return [];
    // Searched wider than it is shown, because the filter runs after the
    // search: eight matches of which one is craftable would otherwise look
    // like "no recipes called that".
    const found = itemTable.search(text, MAX_RESULTS * 8);
    return (recipesOnly ? found.filter((item) => craftable(item.id)) : found).slice(0, MAX_RESULTS);
    // `itemTable` is memoized per language: searching in Chinese has to match
    // against the Chinese names, not against whichever table loaded first.
  }, [query, recipesOnly, craftable, itemTable]);

  return (
    // A width of its own: the window measures its contents now, and a search
    // box that sized itself to whatever had been typed into it would resize
    // the window on every keystroke.
    <div className="hud-panel flex w-60 flex-col gap-1.5 p-2">
      <div className="flex gap-1">
        <Mode active={recipesOnly} onClick={() => setRecipesOnly(true)} icon={<Hammer className="size-3" />}>
          {m.recipe.picker.recipes}
        </Mode>
        <Mode active={!recipesOnly} onClick={() => setRecipesOnly(false)} icon={<Package className="size-3" />}>
          {m.recipe.picker.anyItem}
        </Mode>
      </div>

      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder={recipesOnly ? m.recipe.picker.searchRecipes : m.recipe.picker.searchItems}
        className="h-7 text-xs"
      />

      {query.trim() !== '' && results.length === 0 && (
        <p className="px-1 text-[0.625rem] text-muted-foreground">
          {loading ? m.recipe.picker.loading : recipesOnly ? m.recipe.picker.noRecipe : m.recipe.picker.noItem}
        </p>
      )}

      <ul className="space-y-0.5">
        {results.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item.id)}
              className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10"
            >
              <img src={iconUrl(item.icon)} alt="" className="size-5 shrink-0 rounded-sm object-cover" />
              <span className="min-w-0 flex-1 truncate text-xs" style={{ color: qualityColor(item.quality) }}>
                {item.name}
              </span>
              {/* Only worth saying in the mode where the other kind is also
                  listed — in recipes-only it would be on every row. */}
              {!recipesOnly && craftable(item.id) && <Hammer className="size-3 shrink-0 text-muted-foreground" />}
              <Plus className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>

      <Button variant="outline" className="h-6 w-full text-[0.625rem]" onClick={onCancel}>
        {m.common.cancel}
      </Button>
    </div>
  );
}

function Mode({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem]',
        active ? 'bg-primary/25 text-primary' : 'bg-white/5 text-muted-foreground hover:bg-white/10',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
