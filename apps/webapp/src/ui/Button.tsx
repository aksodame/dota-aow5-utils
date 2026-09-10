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
export type ButtonVariant = 'primary' | 'solid' | 'ghost' | 'danger';
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
