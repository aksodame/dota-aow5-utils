import { net } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PackInstall, PackPreview } from '../core/ipc.ts';
import { MAX_SOUND_BYTES } from '../core/sounds.ts';
import {
  MAX_MANIFEST_BYTES,
  readManifest,
  referencedHashes,
  type PackedSound,
  type PackFail,
  type SoundPack,
} from '../core/packs.ts';

/**
 * The store the packs live in, and the only code that goes to the network for a
 * sound.
 *
 * Content-addressed: a file is kept under its own SHA-256 and nothing else, so
 * the same clip named by three packs is one copy on disk, a pack that changes a
 * sound is a new file rather than an edit, and a hash that does not match is a
 * file that was never in the store to begin with. `core/packs.ts` decides what a
 * manifest is allowed to say; this decides nothing — it fetches what that
 * approved, checks it, and refuses everything else.
 *
 * The distinction matters because of where the input comes from. A pack URL is
 * pasted out of a chat window; the manifest behind it is written by whoever
 * controls that URL; the bytes come from wherever the manifest points. None of
 * those are the player, and all three are treated accordingly: https at every
 * hop, a byte ceiling enforced while reading rather than after, and a hash
 * compared before anything is renamed into place.
 */

/** Redirect hops. Enough for a CDN and a shortener; not enough to be a loop. */
const MAX_HOPS = 5;

/** Per request. A sound that has not arrived by now is one the player is not waiting for. */
const TIMEOUT_MS = 30_000;

/** How many sounds are fetched at once. Polite to the host, and quick enough for a pack of twenty. */
const CONCURRENCY = 4;

class FetchError extends Error {
  // Written out rather than declared in the parameter list: `erasableSyntaxOnly`
  // is on across all three projects, and a parameter property is the one piece
  // of class syntax that does not erase.
  readonly reason: PackFail;
  constructor(reason: PackFail) {
    super(reason);
    this.reason = reason;
  }
}

/** A hash is a filename here, so it is checked as one before it is ever joined to a path. */
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Fetches a URL and hands back at most `limit` bytes, or throws.
 *
 * Redirects are followed by hand rather than by `redirect: 'follow'`, for the
 * one thing that automatic following will not do: check the scheme of every hop.
 * A manifest can only name an https URL, but nothing stops an https server from
 * answering with a redirect somewhere else, and "the first hop was https" is not
 * the property worth having.
 *
 * The cap is applied chunk by chunk as the body arrives, not to the finished
 * buffer and not to `Content-Length`. Both of those are things the far end
 * says; this is the thing that is actually true, and a response that lies about
 * its size is aborted a chunk after it starts rather than after it finishes.
 */
async function fetchCapped(from: string, limit: number): Promise<Uint8Array> {
  let url = from;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!url.startsWith('https://')) throw new FetchError('url');

    let response: Response;
    try {
      response = await net.fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Nothing about this request is personal, and a pack host has no
        // business being handed a session this app happens to hold.
        credentials: 'omit',
      });
    } catch {
      // No network, DNS, TLS, timeout. All the same thing to somebody looking
      // at a settings window: it did not arrive.
      throw new FetchError('offline');
    }

    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (next === null) throw new FetchError('status');
      // Resolved against the current hop, since a `Location` may be relative.
      url = new URL(next, url).href;
      continue;
    }
    if (!response.ok) throw new FetchError('status');

    const body = response.body;
    if (body === null) throw new FetchError('status');

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          // Cancelled rather than read to the end and then rejected: the point
          // of the ceiling is the bytes that are never received.
          await reader.cancel();
          throw new FetchError('too-big');
        }
        chunks.push(value);
      }
    } catch (cause) {
      if (cause instanceof FetchError) throw cause;
      throw new FetchError('offline');
    }

    const out = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  }
  // Out of hops. A redirect chain this long is a loop or a mistake, and either
  // way there is nothing at the end of it worth waiting for.
  throw new FetchError('url');
}

/** Runs `work` over `items`, a few at a time, in whatever order they finish. */
async function pooled<T>(items: readonly T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      await work(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

export class SoundStore {
  private readonly dir: string;

  /** `%APPDATA%\aow5-tracker\sounds\<sha256>`, beside the config rather than beside the exe. */
  constructor(dir: string) {
    this.dir = dir;
  }

  private file(sha256: string): string {
    return path.join(this.dir, sha256);
  }

  /** True when the bytes for this hash are already here, so nothing needs fetching. */
  has(sha256: string): boolean {
    if (!SHA256.test(sha256)) return false;
    try {
      return fs.statSync(this.file(sha256)).isFile();
    } catch {
      return false;
    }
  }

  /**
   * The bytes, for the renderer to decode.
   *
   * Not re-hashed on the way out. What is in the store got there by hashing to
   * its own name, the directory is inside the app's own profile, and hashing 10
   * MB on every launch of a sound would be paying for a threat this design
   * already spent its money on.
   */
  read(sha256: string): Buffer | null {
    if (!SHA256.test(sha256)) return null;
    try {
      return fs.readFileSync(this.file(sha256));
    } catch {
      return null;
    }
  }

  /**
   * Writes verified bytes into the store, through a temporary file and a rename.
   *
   * The same reason `saveConfig` does it: the process can be killed mid-write —
   * by the update button, by Task Manager, by a machine going down — and half a
   * file under a name that promises a hash is worse than no file at all,
   * because `has` would say yes to it forever after.
   */
  private put(sha256: string, bytes: Uint8Array): void {
    const file = this.file(sha256);
    const staging = `${file}.tmp`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(staging, bytes);
      fs.renameSync(staging, file);
    } catch (cause) {
      try {
        fs.rmSync(staging, { force: true });
      } catch {
        // Nothing further to try. The sound simply will not play.
      }
      throw cause instanceof FetchError ? cause : new FetchError('write');
    }
  }

  /**
   * Fetches one sound and stores it, or throws the reason it did not.
   *
   * Two checks, and the order is the point. The declared size caps the transfer
   * so a manifest cannot spend somebody's connection on a file it described as
   * small; the hash then decides whether what arrived is the file the manifest
   * meant. Nothing is written until both have passed, so a mismatch leaves the
   * store exactly as it was.
   */
  /**
   * Fetches something nobody has described yet, and stores it as what arrived.
   *
   * The mirror image of `fetchSound`. There, a manifest states the size and the
   * hash and the download is held to both. Here the tracker is the one choosing
   * the sound — out of a search it made — so there is nothing to be held to.
   * What comes back is capped at what a notification may be, hashed, and
   * *reported*, so the caller can write a pack entry that tells the truth about
   * the file it just fetched.
   *
   * That entry is the point of doing it this way. It is what makes an imported
   * sound shareable: on somebody else's machine it is an ordinary pinned pack
   * entry, fetched from the same public URL and checked against the same hash,
   * with nothing mirrored anywhere in between.
   */
  async capture(url: string): Promise<{ sha256: string; bytes: number }> {
    const bytes = await fetchCapped(url, MAX_SOUND_BYTES);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    this.put(sha256, bytes);
    return { sha256, bytes: bytes.byteLength };
  }

  private async fetchSound(sound: PackedSound): Promise<void> {
    const bytes = await fetchCapped(sound.url, sound.bytes);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== sound.sha256) throw new FetchError('hash');
    this.put(sound.sha256, bytes);
  }

  /**
   * Reads a manifest and reports what installing it would cost — without
   * fetching a single sound.
   *
   * This exists because of what a shared config is: a block of JSON out of a
   * chat window that names URLs an app will go and fetch. Doing that on a paste
   * would be the app deciding on the player's behalf. So the paste buys a list —
   * names, sizes, licences, and the hosts they come from — and the download
   * waits for somebody to have looked at it.
   */
  async preview(url: string): Promise<PackPreview> {
    let raw: unknown;
    try {
      const bytes = await fetchCapped(url, MAX_MANIFEST_BYTES);
      try {
        raw = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new FetchError('json');
      }
    } catch (cause) {
      return { pack: null, dropped: [], bytes: 0, missing: 0, error: reasonOf(cause) };
    }

    const { pack, dropped } = readManifest(raw, url);
    if (pack === null) return { pack: null, dropped, bytes: 0, missing: 0, error: 'shape' };

    // What it would actually cost, which is not the size of the pack: a sound
    // already in the store is one another pack has paid for.
    const wanted = Object.values(pack.sounds).filter((sound) => !this.has(sound.sha256));
    return {
      pack,
      dropped,
      bytes: wanted.reduce((total, sound) => total + sound.bytes, 0),
      missing: wanted.length,
      error: null,
    };
  }

  /**
   * Fetches everything in a pack that is not already here.
   *
   * Per sound rather than all-or-nothing, and it reports both halves. A pack of
   * twenty with one dead link should install nineteen — the alternative is a
   * player who can hear nothing because somebody's file host went down, and no
   * way to tell which link it was.
   */
  async install(pack: SoundPack): Promise<PackInstall> {
    const installed: string[] = [];
    const failed: { id: string; reason: PackFail }[] = [];

    await pooled(Object.entries(pack.sounds), async ([id, sound]) => {
      if (this.has(sound.sha256)) {
        installed.push(id);
        return;
      }
      try {
        await this.fetchSound(sound);
        installed.push(id);
      } catch (cause) {
        failed.push({ id, reason: reasonOf(cause) });
      }
    });

    return { pack, installed: installed.sort(), failed: failed.sort((a, b) => a.id.localeCompare(b.id)) };
  }

  /**
   * Catches the store up with the config, quietly, on the way past.
   *
   * A config file arrives with packs in it far more often than a pack is
   * installed through the settings window — that is the whole point of the
   * feature — and the sounds it names have to be here before a drop rings, not
   * after the player notices silence. Failures are counted, not raised: this
   * runs at startup and there is nobody looking at it.
   */
  async ensure(packs: Record<string, SoundPack>): Promise<{ fetched: number; failed: number }> {
    let fetched = 0;
    let failed = 0;
    const wanted = Object.values(packs)
      .flatMap((pack) => Object.values(pack.sounds))
      .filter((sound) => !this.has(sound.sha256));

    await pooled(wanted, async (sound) => {
      try {
        await this.fetchSound(sound);
        fetched++;
      } catch {
        failed++;
      }
    });
    return { fetched, failed };
  }

  /**
   * Deletes stored files no installed pack refers to any more.
   *
   * By hash across every pack, never per pack: two packs can name the same clip,
   * and removing one of them must not take a sound the other still plays. The
   * `.tmp` files an interrupted write left behind go too — this is the only
   * place that ever gets to clean them up.
   */
  sweep(packs: Record<string, SoundPack>): number {
    const keep = referencedHashes(packs);
    let removed = 0;
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return 0;
    }
    for (const entry of entries) {
      if (SHA256.test(entry) && keep.has(entry)) continue;
      try {
        fs.rmSync(path.join(this.dir, entry), { force: true });
        removed++;
      } catch {
        // Locked, or gone already. It will be here next launch either way.
      }
    }
    return removed;
  }
}

/** Anything that is not one of our own reasons is a bug in here, not a bad manifest. */
const reasonOf = (cause: unknown): PackFail => (cause instanceof FetchError ? cause.reason : 'offline');
