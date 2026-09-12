/**
 * Which fixed-size windows cover a range of row indices.
 *
 * The virtualised list knows which rows are on screen; the API is asked for
 * windows. This is the translation, and it is pure so it can be tested — an
 * off-by-one here fetches the wrong rows and files them at the wrong indices,
 * which shows up as a list that is subtly out of order rather than as an error.
 *
 * Windows are **aligned** to their size: the range 7-14 asks for the windows at
 * 0 and 10, not for one starting at 7. Alignment is what makes two overlapping
 * ranges ask for the same window rather than two offset ones, and therefore
 * what makes "already requested" a set that stops growing.
 */
export function windowsFor(start: number, end: number, size: number, total: number): number[] {
  if (size <= 0 || total <= 0 || end < 0) return [];

  const first = Math.max(0, Math.floor(start / size) * size);
  const last = Math.min(end, total - 1);
  if (last < first) return [];

  const out: number[] = [];
  for (let offset = first; offset <= last; offset += size) out.push(offset);
  return out;
}
