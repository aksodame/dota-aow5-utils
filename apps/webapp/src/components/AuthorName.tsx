import { Badge, Icon } from '@/ui';
import { useApp } from '@/data/AppData';
import type { ProfileLink, PublicUser } from 'aow5-api-contract';
import styles from './AuthorName.module.css';

/**
 * Somebody's name, with the one thing the site knows about them beside it.
 *
 * One component for the browse row, the thread and the build page, because
 * "unverified" has to look the same in all three or it reads as three different
 * statuses. The badge is grey and small on purpose: it is a footnote about an
 * account, not an accusation about a person — anybody may use the whole site
 * without linking anything, their comments simply wait for a moderator first.
 *
 * Nothing is drawn for a verified author. A tick beside every second name is
 * noise, and its absence already says what there is to say.
 *
 * A name with a provider linked to it is a **link out to that profile**, in a
 * new tab. "Who wrote this" is the first question a reader of a guide has, and
 * a nickname here answers it only inside this site — a Steam profile is the
 * portable answer, and it is a page anybody can open anyway. Where an account
 * has both, the name goes to Steam and the second mark carries Discord, so
 * neither is unreachable.
 */
export function AuthorName({
  user,
  className,
  /**
   * The name as text, with none of its doors.
   *
   * The browse row is one anchor from edge to edge, and a link inside a link
   * is not a thing a browser can honour — it is invalid markup, and what it
   * produced was a nickname that swallowed the click meant for the build.
   * Looking somebody up is a thing you do once you have opened their guide, so
   * the profile links live on the build page and the row just says who wrote
   * it. The marks go with them: they are what tells a reader the name is a
   * link, so leaving them beside a name that is not one would be a lie about
   * the row that also costs it the width — which is the width the map name and
   * the title are competing for.
   */
  plain = false,
}: {
  user: PublicUser;
  className?: string;
  plain?: boolean;
}) {
  const { strings } = useApp();
  const [primary, ...rest] = user.profiles;

  return (
    <>
      {plain || primary === undefined ? (
        <span className={className}>{user.nickname}</span>
      ) : (
        <ProfileAnchor profile={primary} className={className} label={profileLabel(strings, primary)}>
          {user.nickname}
          <Mark provider={primary.provider} />
        </ProfileAnchor>
      )}

      {/*
        Every other door, as its own mark.

        Only ever the second one in practice — there are two providers — but
        written as a list because that is what the field is, and a second `if`
        the day a third provider appears is a second place to forget.
      */}
      {!plain &&
        rest.map((profile) => (
          <ProfileAnchor key={profile.provider} profile={profile} label={profileLabel(strings, profile)}>
            <Mark provider={profile.provider} />
          </ProfileAnchor>
        ))}

      {!user.verified && (
        <Badge small title={strings.account.unverifiedHint}>
          {strings.account.unverified}
        </Badge>
      )}
    </>
  );
}

/**
 * `noopener noreferrer`, because this is a link to somewhere else entirely.
 *
 * `noopener` is the one that matters: without it the page being opened gets a
 * handle on this one through `window.opener`. `_blank` so a reader looking
 * somebody up does not lose the build they were reading.
 */
function ProfileAnchor({
  profile,
  label,
  className,
  children,
}: {
  profile: ProfileLink;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className={className === undefined ? styles.link : `${styles.link} ${className}`}
      href={profile.url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
    >
      {children}
    </a>
  );
}

/** The provider's own mark, at the size of the text beside it. */
function Mark({ provider }: { provider: ProfileLink['provider'] }) {
  return provider === 'steam' ? (
    <Icon.SteamMark className={styles.mark} size={13} />
  ) : (
    <Icon.DiscordMark className={styles.mark} size={13} />
  );
}

function profileLabel(strings: { account: { steamProfile: string; discordProfile: string } }, profile: ProfileLink) {
  return profile.provider === 'steam' ? strings.account.steamProfile : strings.account.discordProfile;
}
