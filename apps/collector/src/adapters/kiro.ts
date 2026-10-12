import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { classifyTool, clip, describeInput, parseTs } from "../classify";
import type { AgentEvent } from "../types";
import type { JsonlAdapter } from "../tail";

// ~/.kiro/sessions/cli/<session>.jsonl with metadata (cwd, title) in <session>.json
export const kiro: JsonlAdapter = {
  agent: "kiro",
  roots: [{ dir: `${homedir()}/.kiro/sessions/cli`, pattern: "*.jsonl" }],

  initCtx(path) {
    try {
      const meta = JSON.parse(readFileSync(path.replace(/\.jsonl$/, ".json"), "utf8"));
      return { cwd: meta.cwd, title: meta.title, parentId: meta.parent_session_id ?? undefined };
    } catch {
      return {};
    }
  },

  parse(d, ctx) {
    const base = { agent: "kiro" as const, sessionId: ctx.sessionId, cwd: ctx.cwd, parentId: ctx.parentId };
    const content: any[] = d.data?.content ?? [];
    // Only prompts carry a timestamp; later lines inherit it so backfill isn't "now".
    const raw = d.data?.meta?.timestamp;
    if (raw != null) ctx.extra.ts = parseTs(raw);
    const ts = (ctx.extra.ts as number | undefined) ?? Date.now();
    const out: AgentEvent[] = [];

    switch (d.kind) {
      case "Prompt": {
        const text = content.map((c) => (c.kind === "text" ? c.data : "")).join(" ");
        out.push({ ...base, kind: "prompt", ts, detail: clip(text), title: ctx.title });
        break;
      }
      case "AssistantMessage":
        for (const c of content) {
          if (c.kind === "thinking") out.push({ ...base, kind: "thinking", ts });
          else if (c.kind === "text" && String(c.data).trim())
            out.push({ ...base, kind: "message", ts, detail: clip(String(c.data)) });
          else if (c.kind === "toolUse")
            out.push({
              ...base,
              kind: "tool_start",
              ts,
              tool: c.data.name,
              activity: classifyTool(c.data.name),
              detail: describeInput(c.data.input),
            });
        }
        if (!content.some((c) => c.kind === "toolUse")) out.push({ ...base, kind: "turn_end", ts });
        break;
      case "ToolResults": {
        const failed = content.some((c) => c.kind === "toolResult" && c.data?.status === "error");
        out.push({ ...base, kind: "tool_end", ts, ok: !failed });
        break;
      }
    }
    return out;
  },
};
