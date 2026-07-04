import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getOutputSpeed } from '../dist/speed-tracker.js';
import { existsSync } from 'node:fs';

function restoreEnvVar(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function createTempHome() {
  return await mkdtemp(path.join(tmpdir(), 'claude-hud-speed-'));
}

async function createTranscript(tempHome, name = 'session.jsonl') {
  const transcriptPath = path.join(tempHome, name);
  await writeFile(transcriptPath, '', 'utf8');
  return transcriptPath;
}

function stdinWith(transcriptPath, outputTokens) {
  return {
    transcript_path: transcriptPath,
    context_window: { current_usage: { output_tokens: outputTokens } },
  };
}

test('getOutputSpeed returns null when output tokens are missing', () => {
  const speed = getOutputSpeed({
    transcript_path: '/tmp/claude-hud-speed-missing.jsonl',
    context_window: { current_usage: { input_tokens: 10 } },
  });
  assert.equal(speed, null);
});

test('getOutputSpeed returns null when transcript_path is missing', async () => {
  const tempHome = await createTempHome();

  try {
    const base = { homeDir: () => tempHome };
    const speed = getOutputSpeed(
      { context_window: { current_usage: { output_tokens: 10 } } },
      { ...base, now: () => 1000 }
    );
    assert.equal(speed, null);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('getOutputSpeed computes tokens per second within window', async () => {
  const tempHome = await createTempHome();
  const transcriptPath = await createTranscript(tempHome);

  try {
    const base = { homeDir: () => tempHome };
    const first = getOutputSpeed(stdinWith(transcriptPath, 10), { ...base, now: () => 1000 });
    assert.equal(first, null);

    const second = getOutputSpeed(stdinWith(transcriptPath, 20), { ...base, now: () => 1500 });
    assert.ok(second !== null);
    assert.ok(Math.abs(second - 20) < 0.01);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('getOutputSpeed ignores sub-window bursts to avoid inflated rates', async () => {
  const tempHome = await createTempHome();
  const transcriptPath = await createTranscript(tempHome);

  try {
    const base = { homeDir: () => tempHome };
    getOutputSpeed(stdinWith(transcriptPath, 10), { ...base, now: () => 1000 });

    // Status line re-renders ~50ms later with 60 more tokens. A naive rate
    // calculation would report 1200 tok/s; we expect null instead (#481).
    const speed = getOutputSpeed(stdinWith(transcriptPath, 70), { ...base, now: () => 1050 });
    assert.equal(speed, null);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('getOutputSpeed accumulates repeated short windows until the sample matures', async () => {
  const tempHome = await createTempHome();
  const transcriptPath = await createTranscript(tempHome);

  try {
    const base = { homeDir: () => tempHome };
    getOutputSpeed(stdinWith(transcriptPath, 10), { ...base, now: () => 1000 });

    const firstBurst = getOutputSpeed(stdinWith(transcriptPath, 40), { ...base, now: () => 1200 });
    assert.equal(firstBurst, null);

    const secondBurst = getOutputSpeed(stdinWith(transcriptPath, 70), { ...base, now: () => 1400 });
    assert.equal(secondBurst, null);

    const matured = getOutputSpeed(stdinWith(transcriptPath, 100), { ...base, now: () => 1600 });
    assert.ok(matured !== null);
    assert.ok(Math.abs(matured - 150) < 0.01);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('getOutputSpeed ignores stale windows', async () => {
  const tempHome = await createTempHome();
  const transcriptPath = await createTranscript(tempHome);

  try {
    const base = { homeDir: () => tempHome };
    getOutputSpeed(stdinWith(transcriptPath, 10), { ...base, now: () => 1000 });

    const speed = getOutputSpeed(stdinWith(transcriptPath, 30), { ...base, now: () => 8000 });
    assert.equal(speed, null);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('getOutputSpeed isolates cache across concurrent sessions', async () => {
  const tempHome = await createTempHome();
  const sessionA = await createTranscript(tempHome, 'session-a.jsonl');
  const sessionB = await createTranscript(tempHome, 'session-b.jsonl');

  try {
    const base = { homeDir: () => tempHome };

    // Session A streams: seeds its cache, then reports a speed on the next tick.
    getOutputSpeed(stdinWith(sessionA, 100), { ...base, now: () => 1000 });
    const aSpeed = getOutputSpeed(stdinWith(sessionA, 200), { ...base, now: () => 1500 });
    assert.ok(aSpeed !== null);

    // Session B is idle with a much smaller counter. Before the fix, B would
    // read A's cache entry as its `previous`, compute a bogus speed, or reset
    // A's cache to B's value and poison subsequent A readings. With per-session
    // caches the first B tick must seed a fresh cache and return null.
    const bFirst = getOutputSpeed(stdinWith(sessionB, 5), { ...base, now: () => 1600 });
    assert.equal(bFirst, null);

    // Session A's cache must survive B's tick and keep producing stable speeds.
    const aContinued = getOutputSpeed(stdinWith(sessionA, 300), { ...base, now: () => 2000 });
    assert.ok(aContinued !== null);
    assert.ok(Math.abs(aContinued - 200) < 0.01);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('getOutputSpeed writes cache under CLAUDE_CONFIG_DIR by default', async () => {
  const tempHome = await createTempHome();
  const customConfigDir = path.join(tempHome, '.claude-alt');
  const originalHome = process.env.HOME;
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.HOME = tempHome;
  process.env.CLAUDE_CONFIG_DIR = customConfigDir;

  try {
    const transcriptPath = await createTranscript(tempHome);
    const first = getOutputSpeed(stdinWith(transcriptPath, 10), { now: () => 1000 });
    assert.equal(first, null);

    const second = getOutputSpeed(stdinWith(transcriptPath, 20), { now: () => 1500 });
    assert.ok(second !== null);

    const customCacheDir = path.join(customConfigDir, 'plugins', 'claude-hud', 'speed-cache');
    const defaultCacheDir = path.join(tempHome, '.claude', 'plugins', 'claude-hud', 'speed-cache');
    assert.equal(existsSync(customCacheDir), true);
    assert.equal(existsSync(defaultCacheDir), false);
  } finally {
    restoreEnvVar('HOME', originalHome);
    restoreEnvVar('CLAUDE_CONFIG_DIR', originalConfigDir);
    await rm(tempHome, { recursive: true, force: true });
  }
});
