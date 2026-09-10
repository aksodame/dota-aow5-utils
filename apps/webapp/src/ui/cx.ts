/**
 * Joins class names, skipping anything falsy.
 *
 * This replaces `clsx` + `tailwind-merge` + `class-variance-authority`. Those
 * three existed to reconcile long strings of utility classes at runtime; with
 * CSS modules there is nothing to reconcile — a component owns its classes and
 * the only question left is which of them apply.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
