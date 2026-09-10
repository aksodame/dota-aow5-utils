import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button.tsx';
import { Close } from './Icon.tsx';
import { cx } from './cx.ts';
import styles from './Dialog.module.css';

/**
 * A modal on the native `<dialog>` element.
 *
 * `showModal()` gives us the top layer, a real backdrop, focus containment and
 * Escape-to-close — four of the reasons the previous site shipped Radix. What
 * is left is styling and telling React when it opened.
 */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Rendered in the footer. Omitted means no footer at all. */
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, footer, wide = false, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    /*
     * `open` as an attribute would render the dialog inline and non-modal, so
     * the method has to be called — and calling showModal on an already-open
     * dialog throws, hence the guard.
     */
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /*
   * The page behind a modal must not scroll. `<dialog>` does not do this on its
   * own, and without it a phone scrolls the list underneath while a picker is
   * open, which reads as the picker being broken.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, wide && styles.wide)}
      // Escape fires `cancel`, and the browser closes the dialog itself —
      // which would leave React thinking it is still open. Prevented, so the
      // one path that closes it is the one that updates state.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the backdrop lands on the dialog element itself rather than
      // on anything inside it, which is what distinguishes the two.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.shell}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <Button variant="ghost" size="sm" icon onClick={onClose} aria-label="Close">
            <Close size={16} />
          </Button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer !== undefined && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}
