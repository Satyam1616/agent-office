import { classifyTool, clip, describeInput, parseTs } from "../classify";
import type { AgentEvent } from "../types";
import type { JsonlAdapter } from "../tail";

// ~/.qwen/projects/<project>/chats/<session>.jsonl — Claude-like lines, Gemini-style parts.
export const qwen: JsonlAdapter = {
  agent: "qwen",
  roots: [{ dir: ".qwen/projects", pattern: "*/chats/*.jsonl" }],

  parse(d, ctx) {
    if (typeof d.cwd === "string") ctx.cwd = d.cwd;
    if (typeof d.sessionId === "string") ctx.sessionId = d.sessionId;
    const base = { agent: "qwen" as const, sessionId: ctx.sessionId, cwd: ctx.cwd };
    const ts = parseTs(d.timestamp);
    const parts: any[] = d.message?.parts ?? [];
    const out: AgentEvent[] = [];

    if (d.type === "user") {
      const responses = parts.filter((p) => p.functionResponse);
      if (responses.length)
        out.push({ ...base, kind: "tool_end", ts, ok: !responses.some((p) => p.functionResponse.response?.error) });
      const text = parts.map((p) => p.text ?? "").join(" ");
      if (text.trim() && d.provenance !== "system") out.push({ ...base, kind: "prompt", ts, detail: clip(text) });
    } else if (d.type === "assistant") {
      for (const p of parts) {
        if (p.functionCall) {
          const name = p.functionCall.name;
          out.push({
            ...base,
            kind: "tool_start",
            ts,
            tool: name,
            activity: classifyTool(name),
            detail: describeInput(p.functionCall.args),
          });
        } else if (p.thought) out.push({ ...base, kind: "thinking", ts });
        else if (p.text?.trim()) out.push({ ...base, kind: "message", ts, detail: clip(p.text), model: d.model });
      }
    } else if (d.type === "tool_result") {
      out.push({ ...base, kind: "tool_end", ts });
    }
    return out;
  },
};
