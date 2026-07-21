type ToolArgs = Record<string, unknown>;
/**
 * Dispatch a tool call by name to the appropriate handler function.
 */
export declare function handleToolCall(name: string, args: ToolArgs): Promise<unknown>;
export {};
//# sourceMappingURL=handler.d.ts.map