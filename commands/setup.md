---
description: Configure claude-hud-ccswitch as your statusline
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

# 配置 Claude HUD CC Switch 适配版

**Note**: 文中 `{RUNTIME_PATH}`、`{SOURCE}`、`{GENERATED_COMMAND}` 等占位符需用实际检测值替换。

## Step 0: 检测幽灵安装

如果之前一次安装失败，plugin 状态可能不一致。

**macOS/Linux**:
```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CACHE_EXISTS=$(ls -d "$CLAUDE_DIR/plugins/cache"/*/claude-hud-ccswitch 2>/dev/null && echo YES || echo NO)
REGISTRY_EXISTS=$(grep -q "claude-hud-ccswitch" "$CLAUDE_DIR/plugins/installed_plugins.json" 2>/dev/null && echo YES || echo NO)
TEMP_FILES=$(ls -d "$CLAUDE_DIR/plugins/cache/temp_local_"* 2>/dev/null | head -1)
echo "Cache: $CACHE_EXISTS | Registry: $REGISTRY_EXISTS | Temp: ${TEMP_FILES:-none}"
```

**Windows (PowerShell)**:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$cache = (Get-ChildItem (Join-Path $claudeDir "plugins\cache") -Directory | ForEach-Object { Test-Path (Join-Path $_.FullName "claude-hud-ccswitch") }) -contains $true
$registry = (Get-Content (Join-Path $claudeDir "plugins\installed_plugins.json") -ErrorAction SilentlyContinue) -match "claude-hud-ccswitch"
$temp = Get-ChildItem (Join-Path $claudeDir "plugins\cache\temp_local_*") -ErrorAction SiluallyContinue
Write-Host "Cache: $cache | Registry: $registry | Temp: $($temp.Count) files"
```

| Cache | Registry | 含义 | 处理 |
|-------|----------|------|------|
| YES | YES | 正常安装 | 进入 Step 1 |
| YES | NO | 缓存孤魂 | 清理缓存 |
| NO | YES | 注册表残留 | 清理注册表 |
| NO | NO | 未安装 | 直接进入 Step 1 |

如果检测到 temp 文件，上次安装中断了，先清理。

## Step 0.5: CC Switch 数据可达性

验证 fork 能读到 CC Switch 的数据。如果这步失败，HUD 会回退到显示伪装档位（不影响功能，但失去 fork 的核心价值）：

```bash
sqlite3 ~/.cc-switch/cc-switch.db "SELECT id, name FROM providers;"
```

如果命令报 `unable to open database file`，检查：
- `~/.cc-switch/` 目录是否存在
- 是否给了 `CCSWITCH_DIR` 环境变量覆盖
- sqlite3 是否安装（macOS 自带，Windows 用 `winget install sqlite.sqlite3` 或 `choco install sqlite`）

## Step 1: 检测平台、Shell、运行时

按 `Platform:` + `Shell:` + `$OSTYPE` 三元组分流。Windows 下若 `$OSTYPE=msys|cygwin` 走 bash 分支，不要用 PowerShell。

| Platform | Shell | OSTYPE | 命令格式 |
|----------|-------|--------|----------|
| `darwin` / `linux` | any | any | bash |
| `win32` | `bash` | any | bash — Windows + Git Bash |
| `win32` | `powershell` / `pwsh` / `cmd` | `msys` / `cygwin` | bash — Windows + Git Bash |
| `win32` | `powershell` / `pwsh` / `cmd` | other / empty | PowerShell |

## Step 1.1: 定位 plugin cache 路径

**macOS/Linux**:
```bash
ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud-ccswitch/*/ 2>/dev/null \
  | awk -F/ '{ print $(NF-1) "\t" $(0) }' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+[[:space:]]' \
  | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n \
  | tail -1 \
  | cut -f2-
```

没结果说明没装，先 `/plugin install claude-hud-ccswitch` 再回来。

**Windows (PowerShell)**:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
(Get-ChildItem (Join-Path $claudeDir "plugins\cache\*\claude-hud-ccswitch\*") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d+(\.\d+)+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).FullName
```

## Step 1.2: 定位运行时

**macOS/Linux** — 优先 bun，没有就用 node：
```bash
command -v bun 2>/dev/null || command -v node 2>/dev/null
```

**Windows** — 必须 node，不要用 bun：
```bash
command -v node 2>/dev/null
```

找不到就让用户装 Node.js LTS。

## Step 1.3: 验证 wrapper 存在

本 fork 的 launcher (`wrapper/statusline.mjs`) 用 `import.meta.url` 反查 `dist/`，复制安装时一定要保留 `wrapper/` 子目录：

```bash
ls "{PLUGIN_DIR}/wrapper/statusline.mjs"
```

## Step 2: 备份并写入 statusLine

**总是先备份** `~/.claude/settings.json`：

```bash
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
BACKUP="${SETTINGS}.bak.$(date +%Y%m%d-%H%M%S)"
[ -f "$SETTINGS" ] && cp "$SETTINGS" "$BACKUP" && echo "Backup: $BACKUP"
```

**macOS/Linux** 写入 settings.json 的 statusLine.command：

```bash
node -e '
const fs = require("fs");
const path = require("path");
const settingsPath = process.argv[1];
const pluginDir = process.argv[2];
const runtimePath = process.argv[3];
const wrapper = path.join(pluginDir, "wrapper/statusline.mjs");

let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch (_) {}

const prev = settings.statusLine && settings.statusLine.command;
if (prev) {
  console.log("Existing statusLine preserved at:", settingsPath + ".previous-statusline.txt");
  fs.writeFileSync(settingsPath + ".previous-statusline.txt", prev);
}

settings.statusLine = {
  type: "command",
  command: `${runtimePath} ${JSON.stringify(wrapper)}`.trim(),
};

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
console.log("statusLine updated to:", settings.statusLine.command);
' "$SETTINGS" "$PLUGIN_DIR" "$RUNTIME_PATH"
```

**Windows (PowerShell)** 用 Node launcher（启动时跑 PowerShell 比直接跑 wrapper 在 statusline 频率下更慢）：

写一个独立的 launcher 到 `~/.claude/plugins/claude-hud-ccswitch/launcher.mjs`：

```powershell
$wrapperDir = Join-Path $claudeDir "plugins\claude-hud-ccswitch"
New-Item -ItemType Directory -Force -Path $wrapperDir | Out-Null
$launcherPath = Join-Path $wrapperDir "launcher.mjs"
$launcherBody = @'
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const envColumns = Number.parseInt(process.env.COLUMNS ?? '', 10);
const width = Number.isFinite(envColumns) && envColumns > 0 ? envColumns : 120;
process.env.COLUMNS = String(Math.max(1, width - 4));

const here = path.dirname(fileURLToPath(import.meta.url));
const wrapperPath = path.join(here, '..', 'wrapper', 'statusline.mjs');

if (!fs.existsSync(wrapperPath)) process.exit(0);
const wrapper = await import(pathToFileURL(wrapperPath).href);
if (typeof wrapper.main === 'function') {
  await wrapper.main();
}
'@
[System.IO.File]::WriteAllText($launcherPath, $launcherBody, (New-Object System.Text.UTF8Encoding $false))
```

然后 statusLine.command:

```powershell
$cmdPath = Join-Path $env:SystemRoot "System32\cmd.exe"
if (-not (Test-Path $cmdPath)) { $cmdPath = "cmd.exe" }
$generatedCommand = $cmdPath + ' /d /s /c ""' + $runtimePath + '" "' + $launcherPath + '""'
```

写入 settings.json 用 `WriteAllText` + `UTF8Encoding $false`（避免 PS 5.1 BOM 问题，见 [upstream docs](https://github.com/jarrodwatts/claude-hud) 关于 BOM 的处理）。

## Step 3: 提示重启

> ✅ statusLine 已写入。请**完全退出 Claude Code 后重启**——quit 然后重新 `claude`，HUD 才会出现。

## Step 4: 验证 fork 生效

`/plugin install claude-hud-ccswitch` 之后用户**可能**也装了原版 `claude-hud`。两个插件都在的话，**必须把原版 disable**，否则原版会接管 statusLine 显示错误模型名：

```
/plugin disable claude-hud
```

重启 Claude Code，看到模型徽章从 `claude-opus-4-8[1M]` 变成 `glm-5.2[1M]`（或当前 CC Switch profile 的真实模型）就成功了。

## Step 5: 调试

**模型还是显示伪装档位？**
1. Step 0.5 的 sqlite 命令能否成功？（如不能，CC Switch 数据不可达，HUD 没东西可解析）
2. 当前 CC Switch provider 是否切换到了「Claude」档位？（OpenAI 档位的 provider 不会被 stdin 触发代理伪装，HUD 直接显示 CC Switch 内的真实 model）
3. 是否还有原版 `claude-hud` 开启？（会覆盖 fork）

**settings.json 写入失败？**
- 检查 JSON 语法
- 重试前读备份 `settings.json.bak.*`

**HUD 完全不显示？**
- 完全退出 Claude Code 重启一次（statusline 仅在新进程启动时加载）
- 在 PowerShell 手动跑 statusLine.command 看到 HUD 输出吗？
