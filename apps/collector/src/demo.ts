import { classifyTool } from "./classify";
import { AGENTS, type AgentEvent, type AgentKind } from "./types";

const TOOLS: Record<AgentKind, string[]> = {
  claude: ["Read", "Edit", "Write", "Bash", "Grep", "WebSearch", "TodoWrite", "Agent"],
  codex: ["exec_command", "apply_patch", "web_search", "update_plan"],
  gemini: ["read_file", "replace", "write_file", "run_shell_command", "google_web_search", "list_directory"],
  qwen: ["read_file", "write_file", "run_shell_command", "glob"],
  copilot: ["view", "edit", "bash", "glob", "web_fetch"],
  kiro: ["read", "write", "shell", "grep"],
  opencode: ["read", "edit", "bash", "webfetch", "todowrite", "task"],
};
const FILES = ["src/app.tsx", "api/orders.ts", "db/schema.sql", "README.md", "src/scene/Desk.tsx"];
const COMMANDS = ["bun test", "git diff --stat", "bunx tsc --noEmit", "bun run dev", "ls -la", "docker compose up -d"];
const PROJECTS = ["web-platform", "api-server", "desktop-viewer", "agent-office"];

const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

/** Fake sessions for every agent so the office can be seen without real work. */
export function startDemo(emit: (e: AgentEvent, live: boolean) => void) {
  const sessions = AGENTS.flatMap((agent, i) =>
    Array.from({ length: 1 + (i % 3) }, (_, j) => ({
      agent,
      sessionId: `demo-${agent}-${j}`,
      cwd: `/home/demo/${PROJECTS[(i + j) % PROJECTS.length]}`,
      parentId: undefined as string | undefined,
    })),
  );
  // A couple of subagents working for the first Claude and OpenCode sessions.
  for (const agent of ["claude", "claude", "opencode"] as const) {
    const n = sessions.filter((s) => s.agent === agent && s.parentId).length;
    sessions.push({ agent, sessionId: `demo-${agent}-sub${n}`, cwd: "/home/demo/web-platform", parentId: `demo-${agent}-0` });
  }

  // Populate each room on start so the office is never empty
  for (const s of sessions) {
    emit({ ...s, ts: Date.now(), kind: "thinking" }, true);
  }

  setInterval(() => {
    const s = pick(sessions);
    const roll = Math.random();
    const base = { ...s, ts: Date.now() };
    if (roll < 0.08) emit({ ...base, kind: "turn_end" }, true);
    else if (roll < 0.12) emit({ ...base, kind: "waiting", activity: "wait", detail: "permission requested" }, true);
    else if (roll < 0.2) emit({ ...base, kind: "prompt", detail: "please fix the login bug" }, true);
    else if (roll < 0.3) emit({ ...base, kind: "thinking" }, true);
    else {
      const tool = pick(TOOLS[s.agent]);
      const activity = classifyTool(tool);
      const detail = activity === "shell" ? pick(COMMANDS) : pick(FILES);
      emit({ ...base, kind: "tool_start", tool, activity, detail }, true);
      emit({ ...base, kind: "tool_end", ok: Math.random() > 0.15 }, true);
    }
  }, 450);
}
