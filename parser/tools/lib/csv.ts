/**
 * Minimal RFC 4180 CSV reader.
 *
 * The addon keeps its ability text in `resource/localization_overrides/*.csv`
 * rather than in the KeyValues locale files, and those rows carry HTML
 * descriptions full of commas, quoted attributes and embedded newlines. A
 * split-on-comma would shred them, so this does the real thing: quoted fields,
 * doubled `""` escapes, and CRLF or LF line endings.
 *
 * In-tree and dependency-free, like the rest of the pipeline.
 */

/** Splits raw CSV text into rows of fields. Rejects nothing; empty in, empty out. */
export function parseCsv(text: string): string[][] {
  // A UTF-8 BOM would otherwise become part of the first header name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let dirty = false; // saw any character on this row, so a trailing '' still counts

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    dirty = false;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;

    if (quoted) {
      if (ch !== '"') {
        field += ch;
        continue;
      }
      // `""` inside a quoted field is a literal quote; a lone `"` closes it.
      if (src[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      quoted = true;
      dirty = true;
      continue;
    }
    if (ch === ',') {
      endField();
      dirty = true;
      continue;
    }
    if (ch === '\r') {
      // Swallow CR only as part of CRLF; a bare CR is data.
      if (src[i + 1] === '\n') {
        endRow();
        i++;
      } else {
        field += ch;
        dirty = true;
      }
      continue;
    }
    if (ch === '\n') {
      endRow();
      continue;
    }

    field += ch;
    dirty = true;
  }

  // A file not ending in a newline still has a final row.
  if (dirty || field !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * Parses CSV whose first row is a header, into one record per remaining row.
 *
 * Short rows yield `''` for the missing columns rather than `undefined`, so
 * callers never have to distinguish "absent" from "blank" for a column the
 * header promised.
 */
export function parseCsvRecords(text: string): { header: string[]; rows: Record<string, string>[] } {
  const raw = parseCsv(text);
  const header = raw[0];
  if (!header) return { header: [], rows: [] };

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = raw[r]!;
    // Trailing blank line: one empty field and nothing else.
    if (cells.length === 1 && cells[0] === '') continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) rec[header[c]!] = cells[c] ?? '';
    rows.push(rec);
  }
  return { header, rows };
}
