import { useState, type MouseEvent } from 'react';
import { Avatar, Button, Tab, Tabs } from '@/ui';
import { SignInDialog } from './SignInDialog';
import { useApp } from '@/data/AppData';
import { navigateTo, pathOf, type Match } from '@/router';
// Imported rather than served from a folder: Vite fingerprints it, so the bar's
// one image is cached forever and replaced by name when it changes. The app has
// no `public/` of its own — that belongs to the shared package's game data.
import logotype from '@/assets/logotype.png';
import styles from './TopBar.module.css';

/**
 * Builder, My Creations, Tracker, Settings, and who you are.
 *
 * The right-hand end is the account: a Sign in button for a visitor, and the
 * avatar, the nickname and Sign out for somebody with one. The language
 * switcher is *not* here — it is a preference, and it lives on the Settings tab
 * with the rest of them.
 *
 * The account block is smaller than the settings page's copy of it on purpose:
 * this one shares a 60px bar with four tabs, so the avatar is 26px and the name
 * is 13px, where the page can afford 44 and 22. Sign out keeps its size and its
 * colour — it is the one control here that ends something.
 *
 * On every page, the build page included: a shared link that lands somebody on
 * a screen with no way out of it is the worse of the two problems.
 */
export function TopBar({ match }: { match: Match }) {
  const { strings, me, hasAccount, signOut } = useApp();
  const [signingIn, setSigningIn] = useState(false);
  const route = match.id;

  return (
    <header className={styles.bar}>
      {/*
        The tabs start at the left edge, and Builder is the way home — it points
        at `/`, which is what a clickable wordmark would have done. The mark
        below is therefore a picture rather than a second control: it says whose
        site this is, and the tab beside it goes home.
      */}
      <Tabs className={styles.nav}>
        <Tab href={pathOf('browse')} active={route === 'browse'} onClick={intercept}>
          {strings.nav.browse}
        </Tab>
        {/*
          Only for somebody who can have creations, and decided from
          `hasAccount` rather than from `me` so the first paint already knows.
          Keyed on `me` it was correct but late: `/me` is a round trip, so the
          tab appeared a moment after the bar it belongs to and the two beside
          it slid across to make room.
        */}
        {hasAccount && (
          <Tab href={pathOf('mine')} active={route === 'mine' || route === 'edit'} onClick={intercept}>
            {strings.nav.mine}
          </Tab>
        )}
        {/*
          The catalogue, next to the builder because it is the other half of the
          same question: what can I put in a slot, and what is this thing. An
          item's own page lights this tab too — it is the page you reach *from*
          here, the way the editor lights My Creations.
        */}
        <Tab href={pathOf('items')} active={route === 'items' || route === 'item'} onClick={intercept}>
          {strings.nav.items}
        </Tab>
        <Tab href={pathOf('tracker')} active={route === 'tracker'} onClick={intercept}>
          {strings.nav.tracker}
        </Tab>
        {/*
          Last, and for everybody. Signed out it is the language and a way in;
          signed in it is the account as well — so it is never a tab that opens
          onto nothing.
        */}
        <Tab href={pathOf('settings')} active={route === 'settings'} onClick={intercept}>
          {strings.nav.settings}
        </Tab>
      </Tabs>

      {/*
        Centred against the *window*, not between its neighbours.

        Absolutely positioned because the two sides are different widths and
        both change — a nickname arrives, My Creations appears — and a mark that
        drifted as the account block grew would read as a layout bug. Behind
        everything it shares the row with, and `pointer-events: none`, so it can
        never take a click meant for a tab. It hides on a narrow window, where
        there is no middle to sit in.
      */}
      <img className={styles.logo} src={logotype} alt={strings.brand} />

      {/*
        A button rather than a link: there are three doors and the choice
        between them is a screen. Drawn from `hasAccount`, so a visitor with no
        account gets it in the first paint rather than after `/me` answers; the
        signed-in half waits for `me`, because a name and a picture cannot be
        guessed and an empty pill where a nickname goes is worse than a gap.
      */}
      {!hasAccount ? (
        <Button variant="primary" size="sm" onClick={() => setSigningIn(true)}>
          {strings.auth.signIn}
        </Button>
      ) : me == null ? null : (
        <div className={styles.account}>
          {/*
            A label, not a control. It used to link to settings, which put a
            fifth clickable thing in a row of four tabs and a button — and the
            Settings tab two inches to its left already goes there. Who you are
            is a fact the bar states; everything you can *do* about it is one
            tab away.
          */}
          <span className={styles.me} title={me.nickname}>
            <Avatar src={me.avatar} name={me.nickname} size={26} />
            <span className={styles.nickname}>{me.nickname}</span>
          </span>
          <Button variant="danger" size="sm" onClick={() => void signOut()}>
            {strings.auth.signOut}
          </Button>
        </div>
      )}

      <SignInDialog open={signingIn} onClose={() => setSigningIn(false)} />
    </header>
  );
}

/*
 * `Tab` renders a plain anchor so it can point anywhere, which means the four
 * above would reload the page. This hands the click to the router instead,
 * leaving every modified click — new tab, new window, download — to the
 * browser, exactly as `Link` does.
 */
function intercept(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateTo(event.currentTarget.getAttribute('href') ?? pathOf('browse'));
}
