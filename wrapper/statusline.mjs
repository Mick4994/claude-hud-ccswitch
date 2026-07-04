// 小启动脚本：被 settings.json `statusLine.command` 调用，把 dist/index.js 跑起来。
// 设计原则：零硬编码路径，wrapper 自己定 dist 位置，靠 import.meta.url 反查。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ponytail: Claude Code 派状态栏时把 stdout 接管了，process.stdout.columns 不可靠。
// 优先拿环境变量 COLUMNS，没拿到再退化 120。原因：HIL 子进程读不到 TTY。
const envColumns = Number.parseInt(process.env.COLUMNS ?? '', 10);
const width = Number.isFinite(envColumns) && envColumns > 0 ? envColumns : 120;
process.env.COLUMNS = String(Math.max(1, width - 4));

// ponytail: 路径完全来自 import.meta.url，与安装位置无关（cache / 本地 clone / scoop 都行）。
const here = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(here, '..', 'dist', 'index.js');

if (!fs.existsSync(distPath)) {
  // ponytail: 升级途中 dist 还没就绪？静默退出，不让 statusline 把 Claude Code 卡住。
  process.exit(0);
}

const hud = await import(pathToFileURL(distPath).href);
if (typeof hud.main === 'function') {
  await hud.main();
}
