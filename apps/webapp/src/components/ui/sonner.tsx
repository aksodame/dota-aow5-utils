import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * shadcn ships this wired to next-themes, which this project does not use.
 * Toasts are styled from the same CSS variables as everything else, so they
 * follow the active theme without needing to be told which one it is.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
