import { contextBridge, ipcRenderer } from 'electron';
import type { TrackerEvent } from '../core/events.ts';
import type { SessionHistory } from '../core/history.ts';
import {
  OVERLAY_IDS,
  type LogTrim,
  type OverlayId,
  type SessionSnapshot,
  type SkippedLine,
  type TrackerApi,
  type TrackerConfig,
  type TrackerStatus,
  type UpdateState,
} from '../core/ipc.ts';

/**
 * The only bridge between main and a renderer.
 *
 * Deliberately narrow: the renderer gets validated events and a little config,
 * and has no filesystem or Electron access of its own. `contextIsolation` stays
 * on, so nothing here leaks a raw `ipcRenderer` into page scope.
 *
 * Every window loads the same bundle, so which overlay this one *is* comes from
 * the URL main loaded it with. Resolving it here rather than in the renderer
 * means no React code ever has to read `location`, and a hand-typed id cannot
 * address a window that does not exist.
 */

function currentOverlay(): OverlayId {
  const asked = new URLSearchParams(window.location.search).get('overlay');
  return OVERLAY_IDS.find((id) => id === asked) ?? 'farm';
}

const overlay = currentOverlay();

/** Subscribes and hands back an unsubscribe, so React effects clean up properly. */
function on<T>(channel: string, handler: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: TrackerApi = {
  overlay,

  onEvent: (handler: (event: TrackerEvent) => void) => on<TrackerEvent>('tracker:event', handler),
  onStatus: (handler: (status: TrackerStatus) => void) => on<TrackerStatus>('tracker:status', handler),
  onConfig: (handler: (config: TrackerConfig) => void) => on<TrackerConfig>('tracker:config', handler),
  onInteractive: (handler: (interactive: boolean) => void) => on<boolean>('tracker:interactive', handler),
  onSkipped: (handler: (skipped: SkippedLine[]) => void) => on<SkippedLine[]>('tracker:skipped', handler),
  onUpdate: (handler: (state: UpdateState) => void) => on<UpdateState>('tracker:update', handler),

  getConfig: (): Promise<TrackerConfig> => ipcRenderer.invoke('tracker:getConfig'),
  setConfig: (patch: Partial<TrackerConfig>): Promise<TrackerConfig> => ipcRenderer.invoke('tracker:setConfig', patch),
  setInteractive: (next: boolean): Promise<boolean> => ipcRenderer.invoke('tracker:setInteractive', next),

  setCollapsed: (next: boolean): Promise<boolean> => ipcRenderer.invoke('tracker:setCollapsed', overlay, next),
  setSize: (size: { width: number; height: number }): Promise<{ width: number; height: number }> =>
    ipcRenderer.invoke('tracker:setSize', overlay, size),
  setContentSize: (size: { width?: number; height: number } | null): void =>
    ipcRenderer.send('tracker:contentSize', overlay, size),

  open: (id: OverlayId): Promise<void> => ipcRenderer.invoke('tracker:open', id),
  close: (): Promise<void> => ipcRenderer.invoke('tracker:close', overlay),

  getHistory: (): Promise<SessionHistory[]> => ipcRenderer.invoke('tracker:getHistory'),
  getSession: (): Promise<SessionSnapshot> => ipcRenderer.invoke('tracker:getSession'),
  pickSound: (): Promise<string | null> => ipcRenderer.invoke('tracker:pickSound'),
  readSound: (ref: string): Promise<Uint8Array | null> => ipcRenderer.invoke('tracker:readSound', ref),

  clearHistory: (): Promise<void> => ipcRenderer.invoke('tracker:clearHistory'),
  deleteSessions: (ids: number[]): Promise<void> => ipcRenderer.invoke('tracker:deleteSessions', ids),
  pickLogFile: (): Promise<string | null> => ipcRenderer.invoke('tracker:pickLogFile'),
  compactLog: (): Promise<LogTrim> => ipcRenderer.invoke('tracker:compactLog'),
  newSession: (): Promise<void> => ipcRenderer.invoke('tracker:newSession'),

  getUpdate: (): Promise<UpdateState> => ipcRenderer.invoke('tracker:getUpdate'),
  checkUpdate: (): Promise<void> => ipcRenderer.invoke('tracker:checkUpdate'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('tracker:downloadUpdate'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('tracker:installUpdate'),

  quit: (): Promise<void> => ipcRenderer.invoke('tracker:quit'),
};

contextBridge.exposeInMainWorld('tracker', api);
