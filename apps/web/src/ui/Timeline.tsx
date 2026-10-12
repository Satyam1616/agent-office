import { Button, Select, Slider } from "@fluentui/react-components";
import { History20Regular, Live20Regular, Pause20Filled, Play20Filled } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { replayCommand, setMode, useOffice } from "../store";
import { muted, panel } from "./labels";

const SPEEDS = [1, 10, 30, 120, 600];
const RANGES: [string, number | "all"][] = [
  ["15m", 15 * 60_000],
  ["1h", 60 * 60_000],
  ["6h", 6 * 60 * 60_000],
  ["24h", 24 * 60 * 60_000],
  ["All", "all"],
];

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
  const seek = () => {
    if (drag !== null) replayCommand({ cmd: "seek", t: drag });
    setDrag(null);
  };

  return (
    <div
      className={`${panel} bottom-3 left-1/2 flex max-w-[600px] -translate-x-1/2 flex-wrap items-center justify-center gap-2`}
    >
      <div className="flex gap-1">
        <Button
          size="small"
          appearance={mode === "live" ? "primary" : "secondary"}
          icon={<Live20Regular />}
          onClick={() => setMode("live")}
        >
          Live
        </Button>
        <Button
          size="small"
          appearance={mode === "replay" ? "primary" : "secondary"}
          icon={<History20Regular />}
          onClick={() => setMode("replay")}
        >
          Replay
        </Button>
      </div>

      {mode === "replay" && !replay && <span className={muted}>loading history…</span>}
      {mode === "replay" && replay && (
        <>
          <Button
            size="small"
            icon={replay.playing ? <Pause20Filled /> : <Play20Filled />}
            onClick={() => replayCommand({ cmd: replay.playing ? "pause" : "play" })}
            aria-label={replay.playing ? "Pause" : "Play"}
          />
          {/* Seek once the drag ends (pointer or keyboard), not on every step. */}
          <div onPointerUp={seek} onKeyUp={seek}>
            <Slider
              size="small"
              className="w-[200px]"
              min={replay.from}
              max={Math.max(replay.to, replay.from + 1)}
              step={1000}
              value={drag ?? replay.vt}
              onChange={(_, d) => setDrag(d.value)}
            />
          </div>
          <span className="min-w-16 font-mono text-xs" title={`${day(replay.from)} ${clock(replay.from)} → ${clock(replay.to)}`}>
            {clock(drag ?? replay.vt)}
          </span>
          <Select
            size="small"
            value={String(replay.speed)}
            onChange={(_, d) => replayCommand({ cmd: "speed", speed: Number(d.value) })}
            aria-label="Speed"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </Select>
          <div className="flex gap-0.5">
            {RANGES.map(([label, span]) => (
              <Button key={label} size="small" appearance="subtle" className="!min-w-0 !px-1.5" onClick={() => loadRange(span)}>
                {label}
              </Button>
            ))}
          </div>
          {replay.events === 0 && <span className={muted}>no recorded events in this range yet</span>}
        </>
      )}
    </div>
  );
}
