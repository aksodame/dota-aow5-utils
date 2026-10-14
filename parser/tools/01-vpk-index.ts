import fs from 'node:fs';
import path from 'node:path';
import { DIRS, ensureDirs, loadConfig } from './lib/paths.ts';
import { ARCHIVE_INDEX_SELF, Vpk, mulberry32 } from './lib/vpk.ts';
import { writeJson } from './lib/writeJson.ts';
import { check, checkEqual, checkSoft, exitIfFailed, info, ok, step } from './lib/log.ts';

/**
 * Step 01 — index the VPK and prove the tree parser is byte-exact.
 *
 * Writes cache/vpk-index.json (regenerable, gitignored) and asserts the
 * structural invariants the rest of the pipeline relies on.
 */

const CRC_SAMPLE_SIZE = 200;
const CRC_SAMPLE_SEED = 0xa0f5c001;

ensureDirs();
const cfg = loadConfig();
step(`01 · index VPK`);
info(cfg.vpkPath);

const stat = fs.statSync(cfg.vpkPath);
checkSoft(stat.size, cfg.expected.vpkBytes, 'vpk size');

const vpk = Vpk.open(cfg.vpkPath);
try {
  checkEqual(vpk.header.version, 2, 'vpk version');
  checkSoft(vpk.header.treeSize, cfg.expected.treeSize, 'tree size');
  checkSoft(vpk.entries.size, cfg.expected.entryCount, 'entry count');

  let splitEntries = 0;
  let maxEnd = 0;
  for (const entry of vpk.entries.values()) {
    if (entry.archiveIndex !== ARCHIVE_INDEX_SELF) splitEntries++;
    const end = vpk.header.dataStart + entry.entryOffset + entry.entryLength;
    if (end > maxEnd) maxEnd = end;
  }
  checkEqual(splitEntries, 0, 'entries in split archives');
  check(maxEnd <= stat.size, `data bounds: max end ${maxEnd} <= file size ${stat.size}`);

  const flash3 = vpk.listDir(cfg.flash3IconDir, 'png');
  const panorama = vpk.listDir(cfg.panoramaIconDir, 'vtex_c');
  checkSoft(flash3.length, cfg.expected.flash3ItemPngCount, 'flash3 item PNGs');
  checkSoft(panorama.length, cfg.expected.panoramaItemVtexCount, 'panorama item vtex_c');

  // CRC-verifying a deterministic sample is a cheap, strong proof that every
  // offset/length pair in the tree points where we think it does.
  const paths = [...vpk.entries.keys()].sort();
  const rand = mulberry32(CRC_SAMPLE_SEED);
  const picked = new Set<string>();
  // Skip the handful of multi-hundred-MB entries; the sample is about breadth.
  const MAX_SAMPLE_BYTES = 8 * 1024 * 1024;
  let guard = 0;
  while (picked.size < Math.min(CRC_SAMPLE_SIZE, paths.length) && guard++ < CRC_SAMPLE_SIZE * 50) {
    const candidate = paths[Math.floor(rand() * paths.length)];
    if (!candidate) continue;
    const entry = vpk.entries.get(candidate);
    if (!entry || entry.entryLength > MAX_SAMPLE_BYTES) continue;
    picked.add(candidate);
  }
  let verified = 0;
  for (const p of picked) {
    vpk.read(vpk.require(p)); // throws on CRC mismatch
    verified++;
  }
  check(verified === picked.size, `CRC-verified ${verified} sampled entries`);

  const index = {
    generatedFrom: path.basename(cfg.vpkPath),
    vpkBytes: stat.size,
    vpkMtimeMs: Math.round(stat.mtimeMs),
    header: vpk.header,
    entryCount: vpk.entries.size,
    entries: paths.map((p) => {
      const e = vpk.require(p);
      return {
        path: e.path,
        crc: e.crc,
        offset: e.entryOffset,
        length: e.entryLength,
        preload: e.preload.length,
      };
    }),
  };
  writeJson(path.join(DIRS.cache, 'vpk-index.json'), index);
  ok(`wrote cache/vpk-index.json (${index.entryCount} entries)`);
} finally {
  vpk.close();
}

exitIfFailed();
