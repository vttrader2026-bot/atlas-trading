import type { Tool, ToolGesture } from "./types";

/** The cursor is a tool, not a drawing kind: it selects, moves and edits existing drawings. */
export const cursorTool: { tool: Tool; gesture: ToolGesture } = { tool: "cursor", gesture: "none" };
