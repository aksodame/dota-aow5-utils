import { useId, type ComponentProps, type ReactNode } from 'react';
import { cx } from './cx.ts';
import styles from './Field.module.css';

/**
 * A labelled control, and the three things that always sit under one: a hint,
 * an error, and a character counter.
 *
 * The label is wired to the control with a generated id rather than by wrapping
 * it, so a hint can be `aria-describedby`'d without the label swallowing it.
 *
 * Counting **code points**, not `String.length`, everywhere a cap is shown: the
 * API counts the same way, and counting UTF-16 units would give a Cyrillic
 * title a visibly different budget from a Latin one for no reason a writer
 * could see.
 */
interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  /** Shows `used / max`, in code points. */
  value?: string;
  max?: number;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, value, max, children }: FieldShellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const hasFooter = hint !== undefined || error !== undefined;
  const used = value !== undefined && max !== undefined ? [...value].length : null;

  return (
    <div className={styles.field}>
      {label !== undefined && (
        <label className={styles.label} htmlFor={id}>
          {label}
        </label>
      )}
      {children({ id, describedBy: hasFooter ? hintId : undefined, invalid: error !== undefined })}
      {(hasFooter || used !== null) && (
        <div className={styles.footer}>
          <span id={hintId} className={error !== undefined ? styles.error : styles.hint}>
            {error ?? hint}
          </span>
          {used !== null && max !== undefined && (
            <span className={cx(styles.counter, used >= max && styles.counterFull)}>
              {used}/{max}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A labelled *group* of controls, wearing the same clothes as a `Field`.
 *
 * `Field` associates its label with one control by id, which is right for an
 * input and wrong for a set of buttons: `<label for>` may only point at a
 * labelable element, so pointing it at a grid of hero portraits produces a
 * label a screen reader ignores. `<fieldset>` with a `<legend>` is the native
 * construct for exactly this, and it needs no id at all.
 *
 * The browser's own fieldset border and padding are reset in the stylesheet,
 * because the box is not wanted — only the grouping.
 */
export function Fieldset({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.label}>{label}</legend>
      {children}
      {hint !== undefined && <span className={styles.hint}>{hint}</span>}
    </fieldset>
  );
}

type InputProps = ComponentProps<'input'> & { invalid?: boolean };

export function Input({ className, invalid = false, ...rest }: InputProps) {
  return <input className={cx(styles.control, invalid && styles.invalid, className)} aria-invalid={invalid || undefined} {...rest} />;
}

type TextareaProps = ComponentProps<'textarea'> & { invalid?: boolean };

export function Textarea({ className, invalid = false, ...rest }: TextareaProps) {
  return (
    <textarea className={cx(styles.control, invalid && styles.invalid, className)} aria-invalid={invalid || undefined} {...rest} />
  );
}

type SelectProps = ComponentProps<'select'> & { invalid?: boolean };

/**
 * A native `<select>`, deliberately.
 *
 * The reference's language dropdown is a custom listbox; this is not, because a
 * native select is the one control that is already correct on a phone, already
 * keyboard-navigable, and already translated — and the previous site shipped
 * Radix largely to reimplement it.
 */
export function Select({ className, invalid = false, ...rest }: SelectProps) {
  return <select className={cx(styles.control, invalid && styles.invalid, className)} {...rest} />;
}
