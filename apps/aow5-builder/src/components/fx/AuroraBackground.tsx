/**
 * Slow drifting colour wash behind the page.
 *
 * Pure CSS: three blurred radial blobs on long, offset animations. No canvas,
 * no rAF loop, nothing to clean up — and `motion-reduce` freezes it to a static
 * gradient rather than removing it, so the page keeps its depth either way.
 *
 * `fixed` + `-z-10` keeps it behind content without affecting layout, and
 * `pointer-events-none` keeps it out of hit testing.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-1/3 left-[-10%] size-[55vw] animate-[aurora-a_26s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_38%,transparent),transparent_65%)] blur-3xl motion-reduce:animate-none" />
      <div className="absolute top-[10%] right-[-15%] size-[45vw] animate-[aurora-b_32s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,oklch(0.62_0.19_310)_30%,transparent),transparent_65%)] blur-3xl motion-reduce:animate-none" />
      <div className="absolute bottom-[-25%] left-[25%] size-[50vw] animate-[aurora-c_38s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,oklch(0.68_0.15_195)_26%,transparent),transparent_65%)] blur-3xl motion-reduce:animate-none" />
      {/* Keeps text legible over the wash without flattening it. */}
      <div className="absolute inset-0 bg-background/72" />
    </div>
  );
}
