import type { ReactNode } from 'react';
import type { DescSection } from '@/lib/richDesc';
import { cn } from '@/lib/utils';
import { RichText } from './RichText';

/**
 * The shell the two in-game-style hover cards are built from.
 *
 * Deliberately not themed. These cards are a picture of the game's own
 * tooltips and read as one on a light page as much as a dark one — the same
 * reason an ordinary tooltip is inverted rather than following the surface it
 * floats over. Hence the literal colours: they are the game's, not the site's.
 */
export function GameCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        // `game-card` is not a Tailwind class: it pins the rarity variables to
        // the dark palette, since this surface is dark whatever the page is.
        // See styles.css.
        'game-card w-[21rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#3c4762] bg-[#131a27] text-[#dbe3f0] shadow-2xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The lighter band across the top: art, name, and what names the thing. */
export function GameCardHeader({ children }: { children: ReactNode }) {
  // `items-start`: without it the art's frame stretches to whatever height the
  // column beside it happens to be, and a square icon ends up in a tall box.
  return <header className="flex items-start gap-3 border-b border-white/10 bg-[#1e2739] p-3">{children}</header>;
}

export function GameCardBody({ children }: { children: ReactNode }) {
  return <div className="space-y-2.5 p-3">{children}</div>;
}

/**
 * A dim run-in label — "Skill: Active / Damage".
 *
 * The label arrives with its own punctuation, because what separates it from
 * the value is a translated string too.
 */
export function GameFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="text-[12px] leading-snug text-[#7f96b2]">
      {label}
      <span className="text-[#a9bdd6]">{children}</span>
    </p>
  );
}

/** One of the card's own sections — recipe, tags, and the like. */
export function GameBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-[10px] font-medium tracking-wider text-[#6f829d] uppercase">{title}</h4>
      {children}
    </section>
  );
}

/**
 * The description, in the blocks the game draws it as.
 *
 * Text under a heading is boxed with the heading on a bar above it, the way an
 * item's passive or an ability's sigil upgrades are drawn. Text that arrives
 * before any heading — a plain description, an item's flavour line — is left
 * unboxed, because a box around the only paragraph is just a second border.
 */
export function GameDescription({ sections }: { sections: DescSection[] }) {
  return (
    <div className="space-y-2">
      {sections.map((section, i) =>
        section.heading ? (
          <div key={i} className="overflow-hidden rounded border border-[#453d70] bg-[#1a2032]">
            <p className="bg-[#39316a] px-2.5 py-1.5 text-[12px] font-semibold tracking-wide text-[#cec2ff]">
              <RichText nodes={section.heading} />
            </p>
            {section.body.length > 0 && (
              <div className="px-2.5 py-2 text-[12.5px] leading-relaxed text-[#c5d0e2]">
                <RichText nodes={section.body} />
              </div>
            )}
          </div>
        ) : (
          <div key={i} className="text-[12.5px] leading-relaxed text-[#c5d0e2]">
            <RichText nodes={section.body} />
          </div>
        ),
      )}
    </div>
  );
}
