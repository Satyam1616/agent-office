import { homedir } from "node:os";
import { classifyTool, clip, describeInput, parseTs } from "../classify";
import type { AgentEvent } from "../types";
import type { JsonlAdapter } from "../tail";

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

/** Codex wraps tools in a JS `exec` call: `await tools.exec_command({cmd:"..."})`. */
function unwrapExec(name: string, input: unknown): { tool: string; detail?: string } {
  if (typeof input !== "string") return { tool: name, detail: describeInput(input) };
  const inner = input.match(/tools\.(\w+)\(/)?.[1];
  const cmd = input.match(/\b(?:cmd|q|query):\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  const path = input.match(/\b(?:path|file_path):\s*"((?:[^"\\]|\\.)*)"/)?.[1];
  return {
    tool: inner ?? name,
    detail: cmd ? clip(cmd.replace(/\\n/g, " ")) : path ? describeInput({ path }) : describeInput(input),
  };
}

function parseArgs(args: unknown): unknown {
  if (typeof args !== "string") return args;
  try {
    return JSON.parse(args);
  } catch {
    return args;
  }
}

// ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl
export const codex: JsonlAdapter = {
  agent: "codex",
  roots: [{ dir: `${homedir()}/.codex/sessions`, pattern: "**/*.jsonl" }],

  initCtx(path) {
    const id = path.match(UUID)?.[1];
    return id ? { sessionId: id } : {};
  },

  parse(d, ctx) {
    const p = d.payload ?? {};
    const ts = parseTs(d.timestamp);
    if (d.type === "session_meta") {
      if (p.cwd) ctx.cwd = p.cwd;
      const parent = p.source?.subagent?.thread_spawn?.parent_thread_id ?? p.parent_thread_id ?? p.forked_from_id;
      if (typeof parent === "string") ctx.parentId = parent;
      return [];
    }
    if (d.type === "turn_context" && p.cwd) ctx.cwd = p.cwd;

    const base = { agent: "codex" as const, sessionId: ctx.sessionId, cwd: ctx.cwd, parentId: ctx.parentId };
    const out: AgentEvent[] = [];

    if (d.type === "event_msg") {
      switch (p.type) {
        case "task_started":
          out.push({ ...base, kind: "thinking", ts });
          break;
        case "user_message":
          if (typeof p.message === "string") out.push({ ...base, kind: "prompt", ts, detail: clip(p.message) });
          break;
        case "task_complete":
        case "turn_aborted":
          out.push({ ...base, kind: "turn_end", ts });
          break;
        case "exec_approval_request":
        case "apply_patch_approval_request":
        case "request_user_input":
          out.push({ ...base, kind: "waiting", ts, activity: "wait", detail: "waiting for approval" });
          break;
        case "thread_settings_applied":
          if (p.thread_settings?.model) out.push({ ...base, kind: "meta", ts, model: p.thread_settings.model });
          break;
      }
    } else if (d.type === "response_item") {
      switch (p.type) {
        case "function_call":
        case "custom_tool_call":
        case "local_shell_call": {
          const name = p.name ?? "shell";
          const { tool, detail } = unwrapExec(name, parseArgs(p.arguments ?? p.input ?? p.action));
          out.push({ ...base, kind: "tool_start", ts, tool, activity: classifyTool(tool), detail });
          break;
        }
        case "function_call_output":
        case "custom_tool_call_output": {
          const text = JSON.stringify(p.output ?? "");
          const failed = /Script failed|exit(?:ed)?(?: with)? code:? ?[1-9]|exit_code\\?":\s*[1-9]/i.test(text);
          out.push({ ...base, kind: "tool_end", ts, ok: !failed });
          break;
        }
        case "web_search_call":
          out.push({ ...base, kind: "tool_start", ts, tool: "web_search", activity: "web", detail: p.action?.query });
          break;
        case "reasoning":
          out.push({ ...base, kind: "thinking", ts });
          break;
        case "message":
          if (p.role === "assistant") {
            const text = (p.content ?? []).map((c: any) => c.text ?? "").join(" ");
            if (text.trim()) out.push({ ...base, kind: "message", ts, detail: clip(text) });
          }
          break;
      }
    }
    return out;
  },
};
