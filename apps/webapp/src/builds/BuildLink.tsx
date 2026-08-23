import type { ComponentProps, MouseEvent } from 'react';
import { buildPath } from '@/lib/routes';
import { navigateTo } from '@/router';

/**
 * A link to one build.
 *
 * A real `<a>` with a real href, for the same reason `Link` in the router is:
 * middle-click, ctrl-click and "copy link address" all have to behave, and a
 * button with an onClick breaks every one of them. `Link` itself only takes a
 * static route name, so the dynamic segment gets this.
 */
export function BuildLink({
  slug,
  onClick,
  ...rest
}: { slug: string } & Omit<ComponentProps<'a'>, 'href'>) {
  const href = buildPath(slug);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    // Anything but a plain left click is the browser's business.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo(href);
  }

  return <a href={href} onClick={handleClick} {...rest} />;
}
