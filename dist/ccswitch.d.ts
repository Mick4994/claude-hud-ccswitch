interface CCProviderConfig {
    env?: Record<string, string>;
}
export declare function resolveModelFromConfig(config: CCProviderConfig, claudeModelId?: string): string | null;
/**
 * Read the real model name from CC Switch for the currently active Claude
 * provider.  Results are cached until the cc-switch.db file is modified or the
 * active provider changes.
 */
export declare function getCCSwitchModel(claudeModelId?: string): string | null;
/**
 * Returns true when the given display name looks like a CC Switch proxy label
 * (claude-*) rather than the real upstream model.
 */
export declare function isProxyLabel(name: string): boolean;
export {};
//# sourceMappingURL=ccswitch.d.ts.map