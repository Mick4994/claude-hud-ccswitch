import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
let cache = null;
function getHomeDir() {
    return os.homedir();
}
function getCCSwitchDir() {
    const fromEnv = process.env.CCSWITCH_DIR?.trim();
    if (fromEnv) {
        return fromEnv;
    }
    return path.join(getHomeDir(), ".cc-switch");
}
function getCCSwitchDbPath() {
    return path.join(getCCSwitchDir(), "cc-switch.db");
}
function findSqlite3Executable() {
    const envPath = process.env.CCSWITCH_SQLITE3_PATH?.trim();
    if (envPath && fs.existsSync(envPath)) {
        return envPath;
    }
    // ponytail: 程序目录用 process.env.ProgramFiles，不写盘符，跨 A:/C: 自动适应
    // ponytail: 这是 Windows 通用候选；macOS/Linux 候选列表保留 brew / apt 标准路径
    const candidates = [];
    if (process.platform === "win32") {
        const programFiles = process.env.ProgramFiles || path.join(getHomeDir(), "Program Files");
        candidates.push(path.join(programFiles, "sqlite", "sqlite3.exe"));
    }
    else {
        candidates.push(path.join(getHomeDir(), ".local", "bin", "sqlite3"), "/usr/bin/sqlite3", "/usr/local/bin/sqlite3", "/opt/homebrew/bin/sqlite3");
    }
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    try {
        const where = execFileSync(process.platform === "win32" ? "where.exe" : "which", ["sqlite3"], {
            encoding: "utf-8",
            timeout: 2000,
            windowsHide: true,
        });
        const resolved = where.trim().split(/\r?\n/)[0]?.trim();
        if (resolved && fs.existsSync(resolved)) {
            return resolved;
        }
    }
    catch {
        // ignore
    }
    return null;
}
function readCurrentProviderId() {
    const settingsPath = path.join(getCCSwitchDir(), "settings.json");
    try {
        const raw = fs.readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(raw);
        return settings.currentProviderClaude?.trim() || null;
    }
    catch {
        return null;
    }
}
function queryProviderConfig(providerId) {
    const dbPath = getCCSwitchDbPath();
    const sqlite3 = findSqlite3Executable();
    if (!sqlite3 || !fs.existsSync(dbPath)) {
        return null;
    }
    const safeProviderId = providerId.replace(/'/g, "''");
    const sql = `SELECT settings_config FROM providers WHERE id='${safeProviderId}';`;
    try {
        const output = execFileSync(sqlite3, [dbPath, sql], {
            encoding: "utf-8",
            timeout: 2000,
            windowsHide: true,
        });
        return JSON.parse(output.trim());
    }
    catch {
        return null;
    }
}
// ponytail: 也导出供测试；行为稳定，别因为「不能复用」就再开一个函数
export function resolveModelFromConfig(config, claudeModelId) {
    const env = config.env || {};
    // Detect which Claude tier the request is using so we pick the matching
    // CC Switch profile slot.
    const id = claudeModelId?.toLowerCase() || "";
    const tier = id.includes("haiku")
        ? "haiku"
        : id.includes("sonnet")
            ? "sonnet"
            : id.includes("fable") || id.includes("opusplan")
                ? "fable"
                : "opus";
    // ponytail: env key 走全大写（OPUS/SONNET/HAIKU/FABLE），与 fallback 风格一致；之前用 'Opus' 大小写错配导致 tier 完全没生效
    const tierUpper = tier.toUpperCase();
    const nameKey = `ANTHROPIC_DEFAULT_${tierUpper}_MODEL_NAME`;
    const modelKey = `ANTHROPIC_DEFAULT_${tierUpper}_MODEL`;
    // Prefer the human-readable name if present; otherwise fall back to the raw
    // model identifier CC Switch stores in the profile.
    const value = env[nameKey] || env[modelKey];
    if (value) {
        return value;
    }
    // Fallbacks for older/simpler profiles.
    return (env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
        env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME ||
        env.ANTHROPIC_MODEL ||
        null);
}
/**
 * Read the real model name from CC Switch for the currently active Claude
 * provider.  Results are cached until the cc-switch.db file is modified or the
 * active provider changes.
 */
export function getCCSwitchModel(claudeModelId) {
    const dbPath = getCCSwitchDbPath();
    if (!fs.existsSync(dbPath)) {
        return null;
    }
    const providerId = readCurrentProviderId();
    if (!providerId) {
        return null;
    }
    let dbMtimeMs = 0;
    try {
        dbMtimeMs = fs.statSync(dbPath).mtimeMs;
    }
    catch {
        return null;
    }
    if (cache && cache.dbMtimeMs === dbMtimeMs && cache.providerId === providerId) {
        return cache.model;
    }
    const config = queryProviderConfig(providerId);
    const model = config ? resolveModelFromConfig(config, claudeModelId) : null;
    cache = { dbMtimeMs, providerId, model };
    return model;
}
/**
 * Returns true when the given display name looks like a CC Switch proxy label
 * (claude-*) rather than the real upstream model.
 */
export function isProxyLabel(name) {
    return /^claude-/.test(name.trim());
}
//# sourceMappingURL=ccswitch.js.map