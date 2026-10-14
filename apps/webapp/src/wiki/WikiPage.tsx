import { lazy, Suspense, type ComponentType } from 'react';
import { Loading } from '@/ui';
import { ItemsPage } from '@/routes/ItemsPage';
import type { WikiSection } from '@/router';

/**
 * One section of the wiki, chosen by the URL.
 *
 * Each section is its own chunk. Together they are most of the site's code and
 * a reader opens one or two of them, so the bundle the builder ships stays the
 * size it was before the wiki existed. The catalogue is the exception: it was
 * here first, it is the landing page, and it is small.
 */
export function WikiPage({ section, path }: { section: WikiSection; path: string[] }) {
  if (section === 'items') return <ItemsPage />;

  const Section = SECTIONS[section];
  return (
    <Suspense fallback={<Loading />}>
      <Section path={path} />
    </Suspense>
  );
}

/** What every section page takes: the segments after its name. */
export interface SectionProps {
  path: string[];
}

const SECTIONS: Record<Exclude<WikiSection, 'items'>, ComponentType<SectionProps>> = {
  consumables: lazy(() => import('./sections/ConsumablesPage')),
  monsters: lazy(() => import('./sections/MonstersPage')),
  sky: lazy(() => import('./sections/SkyPage')),
  craft: lazy(() => import('./sections/CraftPage')),
  progression: lazy(() => import('./sections/ProgressionPage')),
  heroes: lazy(() => import('./sections/HeroesPage')),
  vendors: lazy(() => import('./sections/VendorsPage')),
  calc: lazy(() => import('./sections/CalcPage')),
  faq: lazy(() => import('./sections/FaqPage')),
  patchnotes: lazy(() => import('./sections/PatchnotesPage')),
};
