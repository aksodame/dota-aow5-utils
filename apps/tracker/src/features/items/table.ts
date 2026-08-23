import index from 'aow5-shared/public/data/items.index.json';
import names from 'aow5-shared/public/data/locale.en.names.json';
import { ItemTable } from '@core/items.ts';

/**
 * The item table, resolved once for the life of the app.
 *
 * Built at module load rather than behind a hook: the data is bundled, so there
 * is nothing to await and no failure to handle, and every overlay that needs a
 * name or a gold cost can just import it. That the table is never null is worth
 * a little eagerness — the alternative leaks a `| null` into every component
 * that shows an item.
 *
 * English only. The overlay's own chrome is English; translating the item names
 * alone would produce a half-translated panel, and `locale.ru.names.json` is
 * there in `aow5-shared` for whenever the whole thing gets translated.
 */
export const itemTable: ItemTable = ItemTable.from(index.rows, names.names);
