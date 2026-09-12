import type { ComponentProps, ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './Button.module.css';

/**
 * The one button.
 *
 * Variants are a fixed union rather than a class-variance-authority config,
 * because there are five of them and the whole point of this rewrite was to
 * stop shipping a library to express five strings. `asChild` is gone with
 * Radix's Slot: a button that navigates is an anchor, and `ButtonLink` below is
 * that anchor wearing the same clothes.
 */
/**
 * `plain` is the escape hatch, and it is the reason the list is five rather than
 * four: a button whose surface belongs to its caller.
 *
 * Without it the caller has to paint over `solid`, and painting over a variant
 * is a specificity race it loses — `.solid:hover` is three selectors deep and a
 * caller's `.steam:hover` is two, so the brand colour survived at rest and was
 * replaced by the panel's on hover. On the light theme that made "Continue with
 * Steam" a white button with a white label: it vanished under the cursor. This
 * variant brings the geometry, the type and the focus ring, and no colour at
 * all, so nothing of the kit's is left to win.
 */
export type ButtonVariant = 'primary' | 'solid' | 'ghost' | 'danger' | 'plain';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Shared {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square, for a button whose entire content is one glyph. Needs a label. */
  icon?: boolean;
  block?: boolean;
}

export type ButtonProps = Shared & ComponentProps<'button'>;

export function Button({
  variant = 'solid',
  size = 'md',
  icon = false,
  block = false,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Explicitly `button` unless asked otherwise: the default is `submit`,
      // which turns every unlabelled button inside a form into a surprise.
      type={type}
      className={cx(styles.button, styles[variant], styles[size], icon && styles.icon, block && styles.block, className)}
      {...rest}
    />
  );
}

export type ButtonLinkProps = Shared & ComponentProps<'a'>;

/**
 * A real anchor that looks like a button.
 *
 * A genuine `href`, so middle-click, ctrl-click and "copy link address" all
 * behave — which is the entire reason this is not a button with an onClick.
 */
export function ButtonLink({
  variant = 'solid',
  size = 'md',
  icon = false,
  block = false,
  className,
  children,
  ...rest
}: ButtonLinkProps): ReactNode {
  return (
    <a
      className={cx(styles.button, styles[variant], styles[size], icon && styles.icon, block && styles.block, className)}
      {...rest}
    >
      {children}
    </a>
  );
}
