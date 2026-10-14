/**
 * The FAQ's pages for the prerenderer: one per topic and one per tab of a
 * topic, `/wiki/faq/<topic>[/<tab>]`.
 *
 * The FAQ is authored prose, not extracted data, so it is read from
 * `aow5-shared/content/` rather than from the emitted tables — the same files
 * the webapp bundles. Imported, like `names.ts` imports its tables: the three
 * documents are a few hundred kilobytes, every FAQ request needs one, and a
 * bundled import cannot go missing from the image the way a file on disk can.
 *
 * Which address names what, and the sentence a page says about itself, are
 * `faqPage` / `faqPageFacts` in `aow5-shared/wiki`, which the page in the
 * browser calls too.
 */

import { wikiPagePath, type SeoLang } from 'aow5-shared/seo';
import { faqPageFacts, faqPaths, type FaqDoc } from 'aow5-shared/wiki';
import faqEn from 'aow5-shared/content/faq.en.json' with { type: 'json' };
import faqRu from 'aow5-shared/content/faq.ru.json' with { type: 'json' };
import faqZh from 'aow5-shared/content/faq.zh.json' with { type: 'json' };
import { registerWikiSection } from '../wiki-pages.ts';

const DOCS: Record<SeoLang, FaqDoc> = {
  en: faqEn as FaqDoc,
  ru: faqRu as FaqDoc,
  zh: faqZh as FaqDoc,
};

registerWikiSection('faq', {
  page(path, lang) {
    const facts = faqPageFacts(DOCS[lang], path);
    return facts === undefined ? undefined : { facts: { section: 'faq', path, ...facts } };
  },
  links(lang) {
    const doc = DOCS[lang];
    return faqPaths(doc).map((path) => {
      const facts = faqPageFacts(doc, path);
      const text = facts === undefined ? path.join('/') : path.length > 1 ? `${facts.name} — ${facts.facts}` : facts.name;
      return { href: wikiPagePath('faq', path), text };
    });
  },
});
