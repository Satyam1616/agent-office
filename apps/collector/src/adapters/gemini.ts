import { basename, dirname } from "node:path";
import { classifyTool, clip, describeInput, parseTs } from "../classify";
import type { AgentEvent, AgentKind } from "../types";
import type { FileCtx, JsonlAdapter } from "../tail";

const WORKSPACE = /Workspace Directories:\*\*\s*\n\s*-\s*(\S+)/;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: any) => p?.text ?? "").join(" ");
  return "";
}

/** Gemini chat logs append whole messages, or `{"$set":{"messages":[...]}}` rewrites. */
function messagesEvents(agent: AgentKind, msgs: any[], ctx: FileCtx): AgentEvent[] {
  const base = { agent, sessionId: ctx.sessionId };
  const out: AgentEvent[] = [];
  for (const m of msgs) {
    const ts = parseTs(m.timestamp);
    if (m.type === "user") {
      const text = textOf(m.content);
      const ws = text.match(WORKSPACE)?.[1];
      if (ws) ctx.cwd = ws;
      if (ctx.seen.has(m.id)) continue;
      ctx.seen.add(m.id);
      if (!text.startsWith("<")) out.push({ ...base, cwd: ctx.cwd, kind: "prompt", ts, detail: clip(text) });
      continue;
    }
    if (m.type !== "gemini") continue;
    for (const call of m.toolCalls ?? []) {
      const startKey = `start:${call.id}`;
      if (!ctx.seen.has(startKey)) {
        ctx.seen.add(startKey);
        out.push({
          ...base,
          cwd: ctx.cwd,
          kind: "tool_start",
          ts,
          tool: call.name,
          activity: classifyTool(call.name),
          detail: describeInput(call.args),
        });
      }
      const endKey = `end:${call.id}`;
      if (call.result && !ctx.seen.has(endKey)) {
        ctx.seen.add(endKey);
        const failed = (call.result as any[]).some?.((r) => r?.functionResponse?.response?.error);
        out.push({ ...base, cwd: ctx.cwd, kind: "tool_end", ts, ok: !failed });
      }
    }
    const msgKey = `msg:${m.id}`;
    const text = textOf(m.content);
    if (text.trim() && !ctx.seen.has(msgKey)) {
      ctx.seen.add(msgKey);
      out.push({ ...base, cwd: ctx.cwd, kind: "message", ts, detail: clip(text), model: m.model });
    }
  }
  return out;
}

// ~/.gemini/tmp/<project>/chats/session-*.jsonl
export const gemini: JsonlAdapter = {
  agent: "gemini",
  roots: [{ dir: ".gemini/tmp", pattern: "*/chats/*.jsonl" }],

  initCtx(path) {
    // Fallback project name is the tmp folder, e.g. "my-project-1" → "my-project".
    const project = basename(dirname(dirname(path))).replace(/-\d+$/, "");
    return { cwd: `/${project}` };
  },

  parse(d, ctx) {
    if (d.sessionId && d.startTime) {
      ctx.sessionId = d.sessionId;
      return [];
    }
    if (Array.isArray(d.$set?.messages)) return messagesEvents("gemini", d.$set.messages, ctx);
    if (d.type && d.id) return messagesEvents("gemini", [d], ctx);
    return [];
  },
};
