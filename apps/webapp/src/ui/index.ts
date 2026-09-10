/**
 * The UI kit.
 *
 * Hand-rolled and CSS-module-styled, replacing Tailwind + shadcn + Radix +
 * lucide + clsx + tailwind-merge + class-variance-authority. Those made sense
 * while the design was being discovered; this site is a known layout with a
 * dozen repeated pieces, and the pieces turned out cheaper than the machinery.
 *
 * Everything here is presentational and knows nothing about builds. Anything
 * that does lives in `src/components/`.
 */
export { Button, ButtonLink, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button.tsx';
export { Panel } from './Panel.tsx';
export { Field, Fieldset, Input, Select, Textarea } from './Field.tsx';
export { Avatar, Badge, Loading, Notice, Spinner, Tab, Tabs, Tooltip } from './Bits.tsx';
export { Dialog } from './Dialog.tsx';
export { cx } from './cx.ts';
export * as Icon from './Icon.tsx';
