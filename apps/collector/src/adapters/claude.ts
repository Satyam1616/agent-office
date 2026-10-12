import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { classifyTool, clip, describeInput, parseTs } from "../classify";
import type { AgentEvent } from "../types";
import type { JsonlAdapter } from "../tail";

// ~/.claude/projects/<project>/<session>.jsonl, subagents under <session>/subagents/*.jsonl
export const claude: JsonlAdapter = {
  agent: "claude",
  roots: [{ dir: `${homedir()}/.claude/projects`, pattern: "**/*.jsonl" }],

  initCtx(path) {
    if (!path.includes("/subagents/")) return {};
    return { parentId: basename(dirname(dirname(path))) };
  },

  parse(d, ctx) {
    if (typeof d.cwd === "string") ctx.cwd = d.cwd;
    const base = { agent: "claude" as const, sessionId: ctx.sessionId, cwd: ctx.cwd, parentId: ctx.parentId };
    const ts = parseTs(d.timestamp);

    switch (d.type) {
      case "ai-title":
        return [{ ...base, kind: "meta", ts: Date.now(), title: d.aiTitle }];
      case "agent-name":
        return [{ ...base, kind: "meta", ts: Date.now(), title: d.agentName }];
      case "system":
        return d.subtype === "turn_duration" ? [{ ...base, kind: "turn_end", ts }] : [];
      case "user": {
        const c = d.message?.content;
        if (typeof c === "string") {
          if (d.isMeta || c.startsWith("<")) return [];
          return [{ ...base, kind: "prompt", ts, activity: "think", detail: clip(c) }];
        }
        const results = Array.isArray(c) ? c.filter((b: any) => b.type === "tool_result") : [];
        if (results.length)
          return [{ ...base, kind: "tool_end", ts, ok: !results.some((b: any) => b.is_error) }];
        return [];
      }
      case "assistant": {
        const out: AgentEvent[] = [];
        const model = d.message?.model;
        for (const b of d.message?.content ?? []) {
          if (b.type === "thinking") out.push({ ...base, kind: "thinking", ts, model });
          else if (b.type === "text" && b.text?.trim())
            out.push({ ...base, kind: "message", ts, model, detail: clip(b.text) });
          else if (b.type === "tool_use")
            out.push({
              ...base,
              kind: "tool_start",
              ts,
              model,
              tool: b.name,
              activity: classifyTool(b.name),
              detail: describeInput(b.input),
            });
        }
        if (d.message?.stop_reason === "end_turn") out.push({ ...base, kind: "turn_end", ts });
        return out;
      }
    }
    return [];
  },
};
