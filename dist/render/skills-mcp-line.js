import { cyan, green, label } from './colors.js';
const MAX_ITEMS_SHOWN = 4;
const ACTIVITY_NAME_MAX_LEN = 64;
const DISPLAY_CONTROL_PATTERN = new RegExp('[' +
    '\\u0000-\\u001F\\u007F-\\u009F' +
    '\\u061C\\u200E\\u200F' +
    '\\u202A-\\u202E\\u2066-\\u2069\\u206A-\\u206F' +
    ']', 'g');
export function renderSkillsLine(ctx) {
    if (ctx.config?.display?.showSkills !== true) {
        return null;
    }
    return renderNameListLine('Skills', ctx.transcript.skills ?? [], ctx.config?.colors);
}
export function renderMcpLine(ctx) {
    if (ctx.config?.display?.showMcp !== true) {
        return null;
    }
    return renderNameListLine('MCPs', ctx.transcript.mcpServers ?? [], ctx.config?.colors);
}
function renderNameListLine(title, names, colors) {
    const safeNames = names.map(safeActivityName).filter((name) => Boolean(name));
    if (safeNames.length === 0) {
        return null;
    }
    const visibleNames = safeNames.slice(0, MAX_ITEMS_SHOWN).map(name => cyan(name));
    const hiddenCount = safeNames.length - visibleNames.length;
    if (hiddenCount > 0) {
        visibleNames.push(label(`+${hiddenCount} more`, colors));
    }
    return `${green('✓')} ${title} ${label(`(${safeNames.length})`, colors)}: ${visibleNames.join(', ')}`;
}
function safeActivityName(value) {
    const sanitized = value
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
        .replace(/\x1B[@-Z\\-_]/g, '')
        .replace(DISPLAY_CONTROL_PATTERN, '')
        .trim();
    if (!sanitized) {
        return null;
    }
    if (sanitized.length <= ACTIVITY_NAME_MAX_LEN) {
        return sanitized;
    }
    return `${sanitized.slice(0, ACTIVITY_NAME_MAX_LEN - 1)}…`;
}
//# sourceMappingURL=skills-mcp-line.js.map