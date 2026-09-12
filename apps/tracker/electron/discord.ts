/**
 * The socket half of Rich Presence: connecting to whatever Discord is running,
 * and not talking to it too often.
 *
 * The decisions about *what* to show are in `core/presence.ts`, where they can
 * be tested without any of this. What is left here is everything that needs a
 * process: a named pipe, a handshake, a rate limit and a reconnect — none of
 * which a renderer can do, and all of which have to keep quiet when Discord is
 * simply not running, which is most of the time for most people.
 *
 * ## Why not a library
 *
 * `discord-rpc` was archived in favour of the Game SDK, which was archived in
 * favour of a native Social SDK aimed at games that want accounts and voice.
 * What this needs is four opcodes over a local socket, which Discord documents
 * itself. A dependency here would be a larger surface than the protocol.
 *
 * ## The protocol, in full
 *
 * Frames are `<op: int32 LE><length: int32 LE><json>`. Op 0 is the handshake,
 * op 1 carries commands and their replies, op 2 is a close, op 3 and 4 are ping
 * and pong. Discord answers the handshake with a `READY` dispatch, and after
 * that `SET_ACTIVITY` is the only command this sends.
 */

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { samePresence, UPDATE_INTERVAL_MS, wireActivity, type PresenceActivity } from '../core/presence.ts';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

/** How long to wait before trying the pipes again after a failure. */
const RETRY_MS = 30_000;

/**
 * Where Discord listens, in the order it opens them.
 *
 * It takes the first free slot of ten, so a machine that has had two clients
 * running is answering on `discord-ipc-1` and nothing is on `-0`. Trying them in
 * order and keeping the first that connects is the whole discovery mechanism —
 * there is no registry and no announcement.
 *
 * The POSIX paths are for developing on a Mac. The tracker ships for Windows,
 * but a feature that can only be exercised on the machine it ships to is a
 * feature nobody writes tests against by hand either.
 */
function pipes(): string[] {
  if (process.platform === 'win32') {
    return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  }
  const base = process.env['XDG_RUNTIME_DIR'] ?? process.env['TMPDIR'] ?? process.env['TMP'] ?? os.tmpdir();
  const roots = [base, path.join(base, 'app/com.discordapp.Discord'), path.join(base, 'snap.discord')];
  return roots.flatMap((root) => Array.from({ length: 10 }, (_, i) => path.join(root, `discord-ipc-${i}`)));
}

function frame(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

export class DiscordPresence {
  private socket: net.Socket | null = null;
  private ready = false;
  /** The newest activity, whether or not it has been sent yet. */
  private wanted: PresenceActivity | null = null;
  /** What the client is currently showing, as far as this knows. */
  private sent: PresenceActivity | null = null;
  private lastWrite = 0;
  private timer: NodeJS.Timeout | null = null;
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;

  private readonly appId: string;

  constructor(appId: string) {
    // A field rather than a parameter property: this project compiles with
    // `erasableSyntaxOnly`, which allows only syntax a type-stripper can delete.
    this.appId = appId;
  }

  /**
   * Ask for an activity, or for none.
   *
   * Cheap to call on every tick: this records what is wanted and lets the rate
   * limit decide when it goes out. Calling it with the same activity twice
   * costs a comparison — see `flush`.
   */
  set(activity: PresenceActivity | null): void {
    this.stopped = false;
    this.wanted = activity;
    this.connect();
    this.flush();
  }

  /**
   * Stop publishing, and take down what is showing.
   *
   * Clearing before disconnecting matters: a socket that simply closes leaves
   * the last activity in the profile until the client notices, which for
   * somebody who has just switched the setting off is the setting not working.
   */
  stop(): void {
    this.stopped = true;
    this.wanted = null;
    if (this.ready) this.write(null);
    this.clearTimers();
    this.socket?.destroy();
    this.socket = null;
    this.ready = false;
    this.sent = null;
  }

  private clearTimers(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.retry !== null) clearTimeout(this.retry);
    this.timer = null;
    this.retry = null;
  }

  /**
   * Open the first pipe that answers, or arrange to try again later.
   *
   * Every failure here is ordinary — Discord is not installed, or not started,
   * or was closed a minute ago — so none of them is logged or surfaced. The
   * tracker's own rule about the config file applies to this too: nothing about
   * a side feature may stop the thing from working.
   */
  private connect(): void {
    if (this.socket !== null || this.stopped || this.retry !== null) return;

    const candidates = pipes();
    const attempt = (index: number): void => {
      if (index >= candidates.length || this.stopped) {
        this.retry = setTimeout(() => {
          this.retry = null;
          if (this.wanted !== null) this.connect();
        }, RETRY_MS);
        return;
      }

      const socket = net.createConnection(candidates[index] as string);
      socket.once('error', () => {
        socket.destroy();
        if (this.socket === socket) this.socket = null;
        attempt(index + 1);
      });
      socket.once('connect', () => {
        this.socket = socket;
        socket.write(frame(OP_HANDSHAKE, { v: 1, client_id: this.appId }));
      });
      socket.on('data', (chunk) => this.read(chunk));
      socket.once('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.ready = false;
        this.sent = null;
        // Reconnect only while there is something to say. A tracker idling with
        // presence off should not be reopening a socket every half minute.
        if (!this.stopped && this.wanted !== null) this.connect();
      });
    };

    attempt(0);
  }

  /**
   * Read whatever arrived, one frame at a time.
   *
   * Only two frames matter: the `READY` dispatch, which is permission to start
   * sending, and a ping, which has to be answered or the client hangs up. The
   * replies to `SET_ACTIVITY` are ignored — there is nothing useful to do with
   * one, and an error in it means the activity was refused, which the next one
   * will either repeat or fix.
   */
  private read(chunk: Buffer): void {
    let at = 0;
    while (at + 8 <= chunk.length) {
      const op = chunk.readInt32LE(at);
      const length = chunk.readInt32LE(at + 4);
      const body = chunk.subarray(at + 8, at + 8 + length);
      at += 8 + length;

      if (op === OP_PING) {
        this.socket?.write(frame(OP_PONG, JSON.parse(body.toString('utf8') || '{}')));
        continue;
      }
      if (op === OP_CLOSE) {
        this.socket?.destroy();
        continue;
      }
      if (op !== OP_FRAME) continue;

      try {
        const message = JSON.parse(body.toString('utf8')) as { evt?: string };
        if (message.evt === 'READY') {
          this.ready = true;
          this.flush();
        }
      } catch {
        // A frame this cannot parse is a frame it has no use for.
      }
    }
  }

  /**
   * Send what is wanted, if it is allowed to and it would say anything new.
   *
   * Two guards, and they are different. **Identical** is dropped outright: the
   * rates move on every drop and the timer is derived from the clock, so
   * without this every tick would queue an update that changes nothing. **Too
   * soon** is deferred rather than dropped — Discord takes one update per
   * fifteen seconds, and the right thing to send at the end of that window is
   * the newest activity, not the one that happened to arrive first.
   */
  private flush(): void {
    if (!this.ready || this.stopped) return;

    const activity = this.wanted;
    if (samePresence(activity, this.sent)) return;

    const wait = this.lastWrite + UPDATE_INTERVAL_MS - Date.now();
    if (wait > 0) {
      if (this.timer === null) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.flush();
        }, wait);
      }
      return;
    }

    this.write(activity);
  }

  private write(activity: PresenceActivity | null): void {
    const socket = this.socket;
    if (socket === null) return;
    socket.write(
      frame(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        // The pid is what the client attributes the activity to; omitting the
        // activity itself is how the protocol spells "clear it".
        args: activity === null ? { pid: process.pid } : { pid: process.pid, activity: wireActivity(activity) },
        nonce: `${Date.now()}`,
      }),
    );
    this.sent = activity;
    this.lastWrite = Date.now();
  }
}

