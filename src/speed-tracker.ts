import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import type { StdinData } from './types.js';
import { getHudPluginDir } from './claude-config-dir.js';

const SPEED_WINDOW_MS = 2000;
// Status lines can re-render many times per second while tokens stream.
// Computing a rate from sub-500ms windows amplifies noise and produces
// spurious multi-thousand tok/s readings (see #481). Require at least
// half a second of elapsed time before reporting a speed.
const MIN_DELTA_MS = 500;

const CACHE_DIRNAME = 'speed-cache';
const LEGACY_CACHE_FILENAME = '.speed-cache.json';

interface SpeedCache {
  outputTokens: number;
  timestamp: number;
}

export type SpeedTrackerDeps = {
  homeDir: () => string;
  now: () => number;
};

const defaultDeps: SpeedTrackerDeps = {
  homeDir: () => os.homedir(),
  now: () => Date.now(),
};

// Scope the cache by a sha256 of the resolved transcript path so that
// concurrent Claude Code sessions never share or overwrite each other's
// cached output-token counters. Sharing the cache across sessions
// produced bogus speed readings on idle terminals whenever another
// terminal was actively streaming (see #495).
function getCachePath(homeDir: string, transcriptPath: string): string {
  const hash = createHash('sha256').update(path.resolve(transcriptPath)).digest('hex');
  return path.join(getHudPluginDir(homeDir), CACHE_DIRNAME, `${hash}.json`);
}

function readCache(homeDir: string, transcriptPath: string): SpeedCache | null {
  try {
    const cachePath = getCachePath(homeDir, transcriptPath);
    if (!fs.existsSync(cachePath)) return null;
    const content = fs.readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(content) as SpeedCache;
    if (typeof parsed.outputTokens !== 'number' || typeof parsed.timestamp !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(homeDir: string, transcriptPath: string, cache: SpeedCache): void {
  try {
    const cachePath = getCachePath(homeDir, transcriptPath);
    const cacheDir = path.dirname(cachePath);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
  } catch {
    // Ignore cache write failures
  }
}

// Remove the pre-0.x global cache file once, if present. It has no owner
// session so leaving it around only wastes disk.
function removeLegacyCache(homeDir: string): void {
  try {
    const legacyPath = path.join(getHudPluginDir(homeDir), LEGACY_CACHE_FILENAME);
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
    }
  } catch {
    // Ignore cleanup failures
  }
}

export function getOutputSpeed(stdin: StdinData, overrides: Partial<SpeedTrackerDeps> = {}): number | null {
  const outputTokens = stdin.context_window?.current_usage?.output_tokens;
  if (typeof outputTokens !== 'number' || !Number.isFinite(outputTokens)) {
    return null;
  }

  const transcriptPath = stdin.transcript_path?.trim();
  if (!transcriptPath) {
    // Without a stable session key we cannot safely isolate cache entries
    // across concurrent Claude Code sessions, so skip speed tracking.
    return null;
  }

  const deps = { ...defaultDeps, ...overrides };
  const now = deps.now();
  const homeDir = deps.homeDir();

  removeLegacyCache(homeDir);

  const previous = readCache(homeDir, transcriptPath);

  if (!previous) {
    writeCache(homeDir, transcriptPath, { outputTokens, timestamp: now });
    return null;
  }

  if (outputTokens < previous.outputTokens) {
    writeCache(homeDir, transcriptPath, { outputTokens, timestamp: now });
    return null;
  }

  let speed: number | null = null;
  const deltaTokens = outputTokens - previous.outputTokens;
  const deltaMs = now - previous.timestamp;

  if (deltaMs > SPEED_WINDOW_MS) {
    writeCache(homeDir, transcriptPath, { outputTokens, timestamp: now });
    return null;
  }

  if (deltaTokens <= 0) {
    writeCache(homeDir, transcriptPath, { outputTokens, timestamp: now });
    return null;
  }

  if (deltaMs < MIN_DELTA_MS) {
    return null;
  }

  speed = deltaTokens / (deltaMs / 1000);

  writeCache(homeDir, transcriptPath, { outputTokens, timestamp: now });
  return speed;
}
