# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

> ⚠ **本仓库 fork 自 [`jarrodwatts/claude-hud`](https://github.com/jarrodwatts/claude-hud)**。所有上游规范继承，但本 fork 加了 CC Switch 代理解析——见下文「CC Switch 集成」一节。

## Project Overview

Claude HUD is a Claude Code plugin that displays a real-time multi-line statusline. It shows context health, tool activity, agent status, and todo progress.

## Build Commands

```bash
npm ci               # Install dependencies
npm run build        # Build TypeScript to dist/

# Test with sample stdin data
echo '{"model":{"display_name":"Opus"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000}}' | node dist/index.js
```

## Architecture

### Data Flow

```
Claude Code → stdin JSON → parse → render lines → stdout → Claude Code displays
           ↘ transcript_path → parse JSONL → tools/agents/todos
```

**Key insight**: The statusline is invoked every ~300ms by Claude Code. Each invocation:
1. Receives JSON via stdin (model, context, tokens - native accurate data)
2. Parses the transcript JSONL file for tools, agents, and todos
3. Renders multi-line output to stdout
4. Claude Code displays all lines

### Data Sources

**Native from stdin JSON** (accurate, no estimation):
- `model.display_name` - Current model
- `context_window.current_usage` - Token counts
- `context_window.context_window_size` - Max context
- `transcript_path` - Path to session transcript

**From transcript JSONL parsing**:
- `tool_use` blocks → tool name, input, start time
- `tool_result` blocks → completion, duration
- Running tools = `tool_use` without matching `tool_result`
- `TodoWrite` calls → todo list
- `Task` calls → agent info

**From config files**:
- MCP count from `~/.claude/settings.json` (mcpServers)
- Hooks count from `~/.claude/settings.json` (hooks)
- Rules count from CLAUDE.md files

**From Claude Code stdin rate limits**:
- `rate_limits.five_hour.used_percentage` - 5-hour subscriber usage percentage
- `rate_limits.five_hour.resets_at` - 5-hour reset timestamp
- `rate_limits.seven_day.used_percentage` - 7-day subscriber usage percentage
- `rate_limits.seven_day.resets_at` - 7-day reset timestamp

**From CC Switch (fork 专用)**:
- `~/.cc-switch/settings.json` → 当前激活的 Claude provider UUID
- `~/.cc-switch/cc-switch.db` (SQLite) → `providers.settings_config` JSON，里面是 provider 的 `env` 字段，含 `ANTHROPIC_DEFAULT_*_MODEL[_NAME]`

### File Structure

```
src/
├── index.ts           # Entry point
├── stdin.ts           # Parse Claude's JSON input
├── transcript.ts      # Parse transcript JSONL
├── config-reader.ts   # Read MCP/rules configs
├── config.ts          # Load/validate user config
├── git.ts             # Git status (branch, dirty, ahead/behind)
├── ccswitch.ts        # Fork 专用：解析 CC Switch provider 的真实上游模型
├── types.ts           # TypeScript interfaces
└── render/
    ├── index.ts       # Main render coordinator
    ├── session-line.ts   # Compact mode: single line with all info
    ├── tools-line.ts     # Tool activity (opt-in)
    ├── agents-line.ts    # Agent status (opt-in)
    ├── todos-line.ts     # Todo progress (opt-in)
    ├── colors.ts         # ANSI color helpers
    └── lines/
        ├── index.ts      # Barrel export
        ├── project.ts    # Line 1: model bracket + project + git
        ├── identity.ts   # Line 2a: context bar
        ├── usage.ts      # Line 2b: usage bar (combined with identity)
        └── environment.ts # Config counts (opt-in)
```

Fork 新增:
```
wrapper/
└── statusline.mjs     # Claude Code 调用的 launcher；import.meta.url 反查 dist
tests/
└── ccswitch.test.js   # isProxyLabel + resolveModelFromConfig 单元测试
```

## CC Switch 集成

Claude Code 走 CC Switch 代理时，`stdin.model.display_name` 是 `claude-opus-4-8[1M]` / `claude-sonnet-4-6` / `claude-haiku-3` 之类伪装档位。为正确显示真实上游模型（影响计费），fork 加了 `src/ccswitch.ts`：

1. 读 `~/.cc-switch/settings.json`（或 `process.env.CCSWITCH_DIR` 指向的目录）的 `currentProviderClaude` UUID。
2. 用 `sqlite3`（`CCSWITCH_SQLITE3_PATH` 可覆盖）查 `cc-switch.db`，取 `providers.settings_config` JSON。
3. 解析 JSON 里的 `env` 字段，按 stdin 传入的模型 ID 选档位（haiku/sonnet/fable/opus）。
4. 优先返回 `ANTHROPIC_DEFAULT_<TIER>_MODEL_NAME`，否则 `ANTHROPIC_DEFAULT_<TIER>_MODEL`，最后退化到 `ANTHROPIC_DEFAULT_OPUS_MODEL[_NAME]`。

`src/stdin.ts::getModelName()` 在检测 `/^claude-/` 标签时优先用解析出的真实模型，不动其他流程。

**为什么不动 `ANTHROPIC_DEFAULT_OPUS_MODEL`？** 那个变量同时控制 Claude Code 的能力探测（决定 auto mode 能不能开、是否支持 thinking/effort 参数）。改它会把 auto mode 弄破。Fork 只读不改。

**缓存**：解析结果按 cc-switch.db 的 mtime 缓存，provider 切换 / DB 写入自动 invalidate。

### Output Format (default expanded layout)

```
[Opus] │ my-project git:(main*)
Context █████░░░░░ 45% │ Usage ██░░░░░░░░ 25% (1h 30m / 5h)
```

Lines 1-2 always shown. Additional lines are opt-in via config:
- Tools line (`showTools`): ◐ Edit: auth.ts | ✓ Read ×3
- Agents line (`showAgents`): ◐ explore [haiku]: Finding auth code
- Todos line (`showTodos`): ▸ Fix authentication bug (2/5)
- Environment line (`showConfigCounts`): 2 CLAUDE.md | 4 rules

### Context Thresholds

| Threshold | Color | Action |
|-----------|-------|--------|
| <70% | Green | Normal |
| 70-85% | Yellow | Warning |
| >85% | Red | Show token breakdown |

## Plugin Configuration

The plugin manifest is in `.claude-plugin/plugin.json` (metadata only - name, description, version, author).

**StatusLine configuration** must be added to the user's `~/.claude/settings.json` via `/claude-hud:setup`.

The setup command adds an auto-updating command that finds the latest installed version at runtime.

Note: `statusLine` is NOT a valid plugin.json field. It must be configured in settings.json after plugin installation. Updates are automatic - no need to re-run setup.

## Dependencies

- **Runtime**: Node.js 18+ or Bun
- **Build**: TypeScript 5, ES2022 target, NodeNext modules
- **Optional**: `sqlite3` CLI for CC Switch model resolution; 提供 Windows/macOS/Linux 通用候选 + `PATH` 探测。如果 fork 用户没装，模型显示回退到 Claude 伪装档位，功能不破。
