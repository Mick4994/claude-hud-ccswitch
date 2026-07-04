# Claude HUD — CC Switch 适配版

实时显示上下文用量、活跃工具和子 Agent 的 Claude Code HUD；当 Claude Code 走 [CC Switch](https://github.com/farion1231/cc-switch) 代理时，模型徽章显示**真实上游模型**（例如 `glm-5.2[1M]`、`kimi-k2.7-code`、`deepseek-v4`）而不是 Claude 伪装档位。

> 本 fork 基于 [`jarrodwatts/claude-hud`](https://github.com/jarrodwatts/claude-hud)，专为 CC Switch 用户维护。完整功能 / 选项表请阅读 upstream README。
>
> 🌐 [English README](README.md) | 中文文档

![Claude HUD in action](claude-hud-preview-5-2.png)

## 为什么有这个 fork？

Claude Code 经 CC Switch 路由时，会把 `model.display_name` 替换成 `claude-opus-4-8[1M]`、`claude-sonnet-4-6`、`claude-haiku-3` 之类的伪装档位——这样 Claude Code 的能力探测和 auto mode 还能正常工作。但这导致 HUD 显示与你的实际计费模型对不上：你以为是 Claude Opus，实际跑的是 Fireworks 的 `glm-5.2`。

本 fork 在**不动 `ANTHROPIC_DEFAULT_OPUS_MODEL`** 的前提下，从 CC Switch 的 SQLite 数据库 (`~/.cc-switch/cc-switch.db`) 读出真实上游模型名，替换 `stdin.model.display_name` 后再交给原有的渲染管线——其他功能完全保留（autoCompactWindow、advisor、externalUsage、CLI/插件/技能数都还在）。

## 安装

在 Claude Code 实例里执行：

```
/plugin marketplace add Mick4994/claude-hud-ccswitch
/plugin install claude-hud-ccswitch
/reload-plugins
```

然后配置状态栏：

```
/claude-hud-ccswitch:setup
```

<details>
<summary><strong>⚠️ Linux 用户：先点这个</strong></summary>

`/tmp` 是 tmpfs 时装插件会 `EXDEV`：先 `mkdir -p ~/.cache/tmp && TMPDIR=~/.cache/tmp claude` 启动会话再装。

</details>

<details>
<summary><strong>⚠️ Windows 用户：setup 找不到运行时点这里</strong></summary>

必须装 Node.js LTS（`winget install OpenJS.NodeJS.LTS`），setup 检测不到会报错。

</details>

setup 写完 `~/.claude/settings.json` 之后，**完全退出 Claude Code 重启** 一次，HUD 才会出现。

## 环境变量（可选）

| 变量 | 用途 | 默认 |
|------|------|------|
| `CCSWITCH_DIR` | 覆盖 `.cc-switch` 目录位置 | `~/.cc-switch` |
| `CCSWITCH_SQLITE3_PATH` | 显式指定 `sqlite3` 可执行文件 | 自动探测（`~/.local/bin/sqlite3`、`/usr/bin/sqlite3`、`/usr/local/bin/sqlite3`、`/opt/homebrew/bin/sqlite3`、Windows `%ProgramFiles%\sqlite\sqlite3.exe`、`PATH` 上的 `sqlite3`） |

如果 fork 没显示真实模型名，先确认 `~/.cc-switch/cc-switch.db` 能被 `sqlite3` 读到——`sqlite3 ~/.cc-switch/cc-switch.db "SELECT id, name FROM providers;"` 应该能列出你的 provider profile。

## 和 upstream 差在哪？

只有这些改动：

- `src/ccswitch.ts`（新增）：读 `~/.cc-switch/settings.json` 拿当前 provider，再查 `cc-switch.db` 拿 `settings_config` JSON，按模型档位（opus/sonnet/haiku/fable）解析 `ANTHROPIC_DEFAULT_*_MODEL[_NAME]`。
- `src/stdin.ts::getModelName()`：检测 `/^claude-/` 标签时改用解析出的真实名字。
- `wrapper/statusline.mjs`（新增）：纯 `import.meta.url` 反查 dist 路径，零硬编码路径。
- `tests/ccswitch.test.js`（新增）：覆盖 `isProxyLabel` 边界与各档位解析。

其他文件（plugins / skills / tokens / git / advisor / context）**完全没动**。

## 完整配置项

完整 `config.json` 选项表见 [upstream README](https://github.com/jarrodwatts/claude-hud#configuration)。本 fork 没有新增 / 改动任何配置项。

## 跨平台

设计原则：没有任何硬编码路径。

- `~/.cc-switch` 默认值用 `os.homedir()`
- sqlite3 候选路径从 `process.env.ProgramFiles`（Windows）、`/usr/bin` / `/usr/local/bin` / `/opt/homebrew/bin`（macOS/Linux）拼出
- `wrapper/statusline.mjs` 自己定位 `dist/` 路径（`import.meta.url` 反查），不依赖任何安装位置
- 平台走 `process.platform` 区分

## 开发

```bash
git clone https://github.com/Mick4994/claude-hud-ccswitch
cd claude-hud-ccswitch
npm ci && npm run build
npm test
```

参见 [CONTRIBUTING.md](CONTRIBUTING.md)（继承自 upstream，作格式参考）。

## 许可证

MIT — 见 [LICENSE](LICENSE)。上游许可证作者：Jarrod Watts。
