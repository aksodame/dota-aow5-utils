/**
 * A still colour wash behind the page.
 *
 * This used to be three 50vw blobs on `blur-3xl`, drifting on infinite
 * animations. It looked good and it was the reason scrolling stuttered: a
 * fixed layer carrying a 64px blur filter has to be re-rasterised as the page
 * moves behind it, and every `backdrop-filter` above it then had to be
 * recomposited against the result. Together they were most of a frame.
 *
 * Three radial gradients painted into one background do the same job for
 * nothing — a gradient is rasterised once and then only ever composited, so
 * the layer is free to scroll past. There is no filter, no animation, and
 * nothing to honour `prefers-reduced-motion` about.
 *
 * `fixed` + `-z-10` keeps it behind content without affecting layout, and
 * `pointer-events-none` keeps it out of hit testing.
 */
export function AuroraBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        backgroundImage: [
          'radial-gradient(60vw 50vh at 12% -10%, color-mix(in oklch, var(--primary) 22%, transparent), transparent 70%)',
          'radial-gradient(50vw 45vh at 92% 8%, color-mix(in oklch, oklch(0.62 0.19 310) 16%, transparent), transparent 70%)',
          'radial-gradient(55vw 45vh at 45% 105%, color-mix(in oklch, oklch(0.68 0.15 195) 14%, transparent), transparent 70%)',
        ].join(', '),
      }}
    />
  );
}
