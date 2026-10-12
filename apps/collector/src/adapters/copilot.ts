import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { classifyTool, clip, describeInput, parseTs } from "../classify";
import type { JsonlAdapter } from "../tail";

// ~/.copilot/session-state/<session>/events.jsonl
export const copilot: JsonlAdapter = {
  agent: "copilot",
  roots: [{ dir: `${homedir()}/.copilot/session-state`, pattern: "*/events.jsonl" }],

  initCtx(path) {
    return { sessionId: basename(dirname(path)) };
  },

  parse(d, ctx) {
    const data = d.data ?? {};
    const ts = parseTs(d.timestamp);
    if (d.type === "session.start" && data.context?.cwd) ctx.cwd = data.context.cwd;
    const base = { agent: "copilot" as const, sessionId: ctx.sessionId, cwd: ctx.cwd };

    switch (d.type) {
      case "session.model_change":
        return [{ ...base, kind: "meta", ts, model: data.newModel }];
      case "user.message":
        return [{ ...base, kind: "prompt", ts, detail: clip(String(data.content ?? "")) }];
      case "assistant.turn_start":
        return [{ ...base, kind: "thinking", ts }];
      case "assistant.message": {
        const text = typeof data.content === "string" ? data.content : "";
        return text.trim() ? [{ ...base, kind: "message", ts, detail: clip(text) }] : [];
      }
      case "tool.execution_start":
        return [
          {
            ...base,
            kind: "tool_start",
            ts,
            tool: data.toolName,
            activity: classifyTool(String(data.toolName ?? "")),
            detail: describeInput(data.arguments),
            model: data.model,
          },
        ];
      case "tool.execution_complete":
        return [{ ...base, kind: "tool_end", ts, ok: data.success !== false }];
      case "permission.completed":
        return [{ ...base, kind: "tool_end", ts }];
      case "permission.requested":
        return [{ ...base, kind: "waiting", ts, activity: "wait", detail: "permission requested" }];
      case "subagent.started":
        return [{ ...base, kind: "tool_start", ts, tool: "subagent", activity: "delegate", detail: data.agentName }];
      case "assistant.turn_end":
      case "session.task_complete":
      case "abort":
        return [{ ...base, kind: "turn_end", ts }];
      case "session.shutdown":
        return [{ ...base, kind: "session_end", ts }];
    }
    return [];
  },
};
