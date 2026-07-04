import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isProxyLabel,
  resolveModelFromConfig,
} from '../dist/ccswitch.js';

test('isProxyLabel recognizes claude-* alias', () => {
  assert.equal(isProxyLabel('claude-opus-4-8[1M]'), true);
  assert.equal(isProxyLabel('claude-haiku-3'), true);
  assert.equal(isProxyLabel('claude-sonnet-4-6'), true);
});

test('isProxyLabel trims surrounding whitespace', () => {
  assert.equal(isProxyLabel('  claude-opus-4-8  '), true);
});

test('isProxyLabel rejects non-claude upstream names', () => {
  assert.equal(isProxyLabel('glm-5.2'), false);
  assert.equal(isProxyLabel('kimi-k2.7-code'), false);
  assert.equal(isProxyLabel('deepseek-v4'), false);
  // 没有连字符的 claude 单词不算代理标签（可能是用户自定义文案）
  assert.equal(isProxyLabel('Claude Opus'), false);
});

test('isProxyLabel handles empty input', () => {
  assert.equal(isProxyLabel(''), false);
  assert.equal(isProxyLabel('   '), false);
});

test('resolveModelFromConfig prefers _NAME over raw _MODEL', () => {
  const config = {
    env: {
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'accounts/fireworks/models/glm-5p2',
      ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'glm-5.2[1M]',
    },
  };
  assert.equal(resolveModelFromConfig(config, 'claude-opus-4-8[1M]'), 'glm-5.2[1M]');
});

test('resolveModelFromConfig maps haiku tier from model id', () => {
  const config = {
    env: {
      ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME: 'kimi-k2.7-code',
    },
  };
  assert.equal(resolveModelFromConfig(config, 'claude-haiku-3'), 'kimi-k2.7-code');
});

test('resolveModelFromConfig maps sonnet tier from model id', () => {
  const config = {
    env: {
      ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: 'deepseek-v4',
    },
  };
  assert.equal(resolveModelFromConfig(config, 'claude-sonnet-4-6'), 'deepseek-v4');
});

test('resolveModelFromConfig defaults to opus when tier cannot be inferred', () => {
  const config = {
    env: {
      ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: 'glm-5.2',
    },
  };
  // 模型 id 完全不像 claude-* → 退化到 opus
  assert.equal(resolveModelFromConfig(config, 'unknown-model'), 'glm-5.2');
});

test('resolveModelFromConfig falls back to legacy env vars when tier slot missing', () => {
  const config = {
    env: {
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.2[1M]',
    },
  };
  // 没有 _NAME 也找不到 sonnet/haiku slot → opus fallback
  assert.equal(resolveModelFromConfig(config, 'claude-sonnet-4-6'), 'glm-5.2[1M]');
});

test('resolveModelFromConfig returns null when no usable env present', () => {
  assert.equal(resolveModelFromConfig({}, 'claude-opus-4-8[1M]'), null);
  assert.equal(resolveModelFromConfig({ env: {} }, 'claude-opus-4-8[1M]'), null);
});
