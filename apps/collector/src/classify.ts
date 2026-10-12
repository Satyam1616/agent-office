import type { Activity } from "./types";

// Order matters: first match wins ("TodoWrite" is planning, not writing).
const RULES: [RegExp, Activity][] = [
  [/^(task|agent|subagent|spawn|delegate|launch_agent|invoke_agent)/, "delegate"],
  [/(todo|plan|update_topic|task_tracker)/, "plan"],
  [/(ask|question|permission|confirm|user_input)/, "wait"],
  [/(web|google|^fetch|browse)/, "web"],
  [/(grep|glob|search|find|list|^ls$|^rg$|codebase)/, "search"],
  [/(bash|shell|exec|command|terminal|powershell|stdin|sql)/, "shell"],
  [/(edit|write|patch|replace|create|insert|notebook)/, "write"],
  [/(read|view|cat|open)/, "read"],
];

export function classifyTool(name: string): Activity {
  const n = name.toLowerCase();
  for (const [re, activity] of RULES) if (re.test(n)) return activity;
  return "other";
}

export function clip(text: string, max = 80): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

export function shortPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/") || p;
}

const PATH_KEYS = ["file_path", "filePath", "absolute_path", "path", "dir_path", "notebook_path"];
const TEXT_KEYS = ["command", "cmd", "pattern", "query", "url", "description", "prompt", "title", "skill"];

/** Best-effort one-liner for a tool call's input, whatever the agent's schema. */
export function describeInput(input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input === "string") {
    const file = input.match(/\*\*\* (?:Update|Add|Delete) File: ([^\s\\]+)/);
    return file ? shortPath(file[1]!) : clip(input);
  }
  if (typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  for (const k of PATH_KEYS) if (typeof o[k] === "string" && o[k]) return shortPath(o[k] as string);
  for (const k of TEXT_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v) return clip(v);
    if (Array.isArray(v)) return clip(v.join(" "));
  }
  const ops = o.operations;
  if (Array.isArray(ops) && typeof ops[0]?.path === "string") return shortPath(ops[0].path);
  return undefined;
}

export function parseTs(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}
