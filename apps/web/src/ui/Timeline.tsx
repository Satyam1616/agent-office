import { useEffect, useState } from "react";
import { replayCommand, setMode, useOffice } from "../store";
import { control, muted, panel } from "./labels";

const SPEEDS = [1, 10, 30, 120, 600];
const RANGES: [string, number | "all"][] = [
  ["15m", 15 * 60_000],
  ["1h", 60 * 60_000],
  ["6h", 6 * 60 * 60_000],
  ["24h", 24 * 60 * 60_000],
  ["All", "all"],
];

const ON = "border-[#2f81f7] bg-[#2f81f7]";

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const day = (t: number) => new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });

/** Live / replay switch and the playback controls. */
export function Timeline() {
  const mode = useOffice((s) => s.mode);
  const replay = useOffice((s) => s.replay);
  const history = useOffice((s) => s.history);
  // Local slider value while dragging, so the playhead doesn't fight the user.
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => setDrag(null), [replay?.from, replay?.to]);

  const loadRange = (span: number | "all") => {
    const last = history?.last ?? Date.now();
    const first = history?.first ?? last;
    replayCommand({ cmd: "load", from: span === "all" ? first : Math.max(first, last - span), to: last });
  };

  return (
    <div
      className={`${panel} bottom-3 left-1/2 flex max-w-[560px] -translate-x-1/2 flex-wrap items-center justify-center gap-2`}
    >
      <div className="flex gap-0.5">
        <button className={`${control} ${mode === "live" ? ON : ""}`} onClick={() => setMode("live")}>
          ● Live
        </button>
        <button className={`${control} ${mode === "replay" ? ON : ""}`} onClick={() => setMode("replay")}>
          ⏪ Replay
        </button>
      </div>

      {mode === "replay" && !replay && <span className={muted}>loading history…</span>}
      {mode === "replay" && replay && (
        <>
          <button
            className={`${control} w-8`}
            onClick={() => replayCommand({ cmd: replay.playing ? "pause" : "play" })}
            title={replay.playing ? "Pause" : "Play"}
          >
            {replay.playing ? "⏸" : "▶"}
          </button>
          <input
            type="range"
            className="w-[200px] accent-[#2f81f7]"
            min={replay.from}
            max={Math.max(replay.to, replay.from + 1)}
            value={drag ?? replay.vt}
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={() => {
              if (drag !== null) replayCommand({ cmd: "seek", t: drag });
              setDrag(null);
            }}
          />
          <span className="min-w-16 font-mono text-xs" title={`${day(replay.from)} ${clock(replay.from)} → ${clock(replay.to)}`}>
            {clock(drag ?? replay.vt)}
          </span>
          <select
            className={control}
            value={replay.speed}
            onChange={(e) => replayCommand({ cmd: "speed", speed: Number(e.target.value) })}
            title="Speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <div className="flex gap-0.5">
            {RANGES.map(([label, span]) => (
              <button key={label} className={`${control} px-1.5 py-0.5 text-[11px]`} onClick={() => loadRange(span)}>
                {label}
              </button>
            ))}
          </div>
          {replay.events === 0 && <span className={muted}>no recorded events in this range yet</span>}
        </>
      )}
    </div>
  );
}
