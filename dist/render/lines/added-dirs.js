import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dim, label } from '../colors.js';
const CONTROL_AND_BIDI_PATTERN = new RegExp('[' +
    '\\u0000-\\u001F\\u007F-\\u009F' +
    '\\u061C\\u200E\\u200F' +
    '\\u202A-\\u202E\\u2066-\\u2069\\u206A-\\u206F' +
    ']', 'g');
export function sanitize(value) {
    return value.replace(CONTROL_AND_BIDI_PATTERN, '');
}
export function basenameOf(dir) {
    const segments = dir.split(/[/\\]/).filter(Boolean);
    return segments[segments.length - 1] ?? dir;
}
export const MAX_RENDERED_ADDED_DIRS = 5;
export const MAX_ADDED_DIR_NAME_LEN = 24;
// Length is measured in UTF-16 code units, not grapheme clusters; a name
// of mostly 4-byte codepoints (emoji, rare CJK) may render slightly wider
// than MAX_ADDED_DIR_NAME_LEN. Acceptable simplification for a statusline.
export function truncateBasename(name) {
    if (name.length <= MAX_ADDED_DIR_NAME_LEN)
        return name;
    return name.slice(0, MAX_ADDED_DIR_NAME_LEN - 1) + '…';
}
export function normalizeAddedDirs(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === 'string' &&
        v.length > 0 &&
        sanitize(basenameOf(v)).length > 0);
}
function getFileHref(filePath) {
    try {
        return pathToFileURL(path.resolve(filePath)).toString();
    }
    catch {
        return null;
    }
}
function hyperlink(uri, text) {
    const esc = '\x1b';
    const st = '\\';
    return `${esc}]8;;${uri}${esc}${st}${text}${esc}]8;;${esc}${st}`;
}
function safeHyperlink(uri, text) {
    if (!uri)
        return text;
    try {
        const parsed = new URL(uri);
        if (parsed.protocol !== 'file:')
            return text;
        return hyperlink(parsed.toString(), text);
    }
    catch {
        return text;
    }
}
export function renderAddedDirsLine(ctx) {
    const display = ctx.config?.display;
    if (display?.showAddedDirs === false)
        return null;
    if ((display?.addedDirsLayout ?? 'inline') !== 'line')
        return null;
    const dirs = normalizeAddedDirs(ctx.stdin.workspace?.added_dirs);
    if (dirs.length === 0)
        return null;
    const colors = ctx.config?.colors;
    const visible = dirs.slice(0, MAX_RENDERED_ADDED_DIRS);
    const overflow = dirs.length - visible.length;
    const rendered = visible.map((dir) => {
        const name = truncateBasename(sanitize(basenameOf(dir)));
        return safeHyperlink(getFileHref(dir), dim(name));
    });
    if (overflow > 0) {
        rendered.push(dim(`+${overflow} more`));
    }
    return `${label('Added dirs:', colors)} ${rendered.join(dim(', '))}`;
}
//# sourceMappingURL=added-dirs.js.map