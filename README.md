# Agent Office

Kantor virtual 3D yang nampilin semua coding agent di mesin ini lagi kerja, real-time.
Tiap agent punya ruangan sendiri, tiap sesi jadi satu karakter di meja. Animasi, layar
monitor, dan bubble di atas kepala ngikutin apa yang lagi dikerjain (baca file, ngoding,
terminal, browsing, planning, delegasi ke subagent, nunggu izin, idle).

## Tim per sesi

Tiap sesi tampil sebagai satu pod isi 6 karakter. Tiap tool call dikerjain karakter yang
sesuai rolenya, dan kalau kerjaan pindah role ada kertas yang terbang ke meja berikutnya:

| Role        | Ngerjain                                                        |
| ----------- | --------------------------------------------------------------- |
| 📋 Lead     | mikir, ngobrol, planning, delegasi, nunggu kamu                 |
| 📖 Reader   | baca file, grep/glob                                            |
| ⌨️ Coder    | edit / write / patch                                            |
| 🖥️ Bash     | command terminal                                                |
| 🌐 Research | web search / fetch                                              |
| 🔍 Reviewer | command verifikasi: test, lint, tsc, git diff, audit…           |

Role ini cuma visual, ditentuin dari tool call di `apps/web/src/roles.ts`.
Subagent asli duduk sendiri di baris depan ruangan.

## Tiga visual: kantor, robot, atau pabrik

Pilih lewat dropdown di pojok kiri atas (atau `?theme=office|robots|factory`); pilihan diinget browser.

- **👥 Office**: tiap sesi satu tim 6 orang di meja.
- **🤖 Robots**: sama, tapi orangnya robot 3D beranimasi (warna badan = warna agent).
  Ngoding/terminal = Punch, baca = Yes, nyari = No, ngobrol = Wave, nunggu kamu = Jump,
  idle = duduk. Turn selesai: satu tim ThumbsUp; tool gagal: geleng kepala.
- **🏭 Factory**: tiap sesi satu production cell. File yang dikerjain jadi benda kerja di
  conveyor, pindah dari mesin ke mesin:

| Role     | Mesin           | Animasi                                         |
| -------- | --------------- | ----------------------------------------------- |
| Lead     | 🦾 Robot Arm    | lengan muter ngoper benda kerja                 |
| Reader   | 🔦 3D Scanner   | sinar laser nyapu benda kerja                   |
| Coder    | ⚙️ CNC Mill     | spindle muter, serpihan logam muncrat (edit)    |
|          | 🖨️ 3D Printer   | benda tumbuh lapis demi lapis (file baru)       |
| Bash     | ⚡ Laser Cutter | gantry gerak, sinar hijau, percikan             |
| Research | 📡 Dish & Dock  | parabola muter, gelombang sinyal                |
| Reviewer | 🔬 QC / CMM     | probe ngecek; lampu 🟢 lolos / 🔴 gagal          |
| Subagent | 🛻 AGV          | robot pengangkut bolak-balik                    |

Lampu andon per cell: 🟢 jalan, 🟡 kedip = nunggu kamu, 🔴 tool terakhir gagal.
Keranjang 📦 ngitung turn yang selesai. Panel kiri nampilin parts, ops, dan fail rate.
Gagal/lolos dibaca dari log tiap agent (`is_error`, exit code, `status: error`, dst).

## Suara

Tombol 🔇/🔊 di sebelah dropdown. Mesin di pabrik pakai **rekaman asli** (CC0 dari Freesound,
lihat `apps/web/public/sounds/README.md`): ⚙️ CNC mill waktu agent ngedit file, 🖨️ motor stepper
waktu bikin file baru, ⚡ laser cutter waktu jalanin command. Sisanya disintesis Web Audio:
gemuruh conveyor, ketikan keyboard di kantor, "ding" waktu turn selesai, buzzer waktu tool gagal,
alarm waktu agent nunggu kamu, dan chime waktu sesi baru masuk.

## Replay

Tombol **⏪ Replay** di bawah (atau `?mode=replay`). Collector nyimpen semua event live ke
SQLite (`apps/collector/agent-office.db`); replay muter ulang pakai reducer yang sama di jam
virtual, khusus buat penonton itu (penonton live gak keganggu). Pilih rentang 15m/1h/6h/24h/All,
play/pause, speed 1×–600×, geser slider buat lompat. History baru keisi sejak collector versi
ini jalan.

## Jalanin

```bash
bun install
bun run dev        # collector :4747 + web :5173 → buka http://127.0.0.1:5173
bun run dev:demo   # data palsu buat semua agent, enak buat liat-liat
```

`?zoom=40` di URL buat ngatur zoom awal. Klik karakter buat liat detail sesinya.

## Dari laptop lain

Real-time, delay sekitar 1 detik. Default-nya server cuma bisa dibuka dari mesin ini sendiri.
Buat lintas mesin, pakai Tailscale biar gak perlu buka port ke internet.

**1. Jadiin mesin ini hub** (web + collector di satu port, wajib pakai token):

```bash
export TOKEN=$(openssl rand -hex 16)   # simpen, dipakai viewer & relay
HOST=$(tailscale ip -4) bun run start  # build web, lalu serve di :4747
```

**2. Nonton dari device lain di tailnet:** buka `http://<ip-tailscale-hub>:4747/?token=<TOKEN>`.
Token-nya diinget browser, jadi berikutnya cukup buka URL tanpa `?token`.

**3. Agent di laptop lain ikut masuk kantor:** di laptop itu, clone repo ini terus jalanin:

```bash
bun install
TOKEN=<TOKEN> RELAY_TO=http://<ip-tailscale-hub>:4747 bun run relay
```

Relay ngebaca log agent di laptop itu terus ngirim event-nya ke hub. Tiap pod dapet label
`@nama-mesin` (bisa diganti pakai `MACHINE=nama`). Kalau hub restart, relay nyambung lagi
sendiri dan ngirim ulang status terakhir.

Catatan:
- Server nolak jalan di alamat selain localhost kalau `TOKEN` belum di-set (minimal 16 karakter).
- WSL2 mode NAT gak bisa diakses dari LAN secara langsung. Tailscale di dalam WSL
  (`tailscale ip -4`) ngelewatin masalah itu.
- Lalu lintasnya HTTP biasa, jadi aman kalau lewat Tailscale (udah terenkripsi WireGuard).
  Jangan diekspos ke internet publik tanpa HTTPS.

## Cara kerja

```
log sesi tiap agent ──► apps/collector (Bun) ──WebSocket──► apps/web (React Three Fiber)
                         adapter → event standar → state per sesi (+ SQLite buat statistik)
```

Collector cuma **membaca** log yang udah ditulis tiap agent; gak ada config agent yang diubah.
Server cuma listen di `127.0.0.1` karena log berisi prompt dan kode.

| Agent       | Sumber                                              | Adapter                         |
| ----------- | --------------------------------------------------- | ------------------------------- |
| Claude Code | `~/.claude/projects/**/*.jsonl`                     | `adapters/claude.ts`            |
| Codex       | `~/.codex/sessions/**/rollout-*.jsonl`              | `adapters/codex.ts`             |
| Gemini CLI  | `~/.gemini/tmp/*/chats/*.jsonl`                     | `adapters/gemini.ts`            |
| Qwen Code   | `~/.qwen/projects/*/chats/*.jsonl`                  | `adapters/qwen.ts`              |
| Copilot CLI | `~/.copilot/session-state/*/events.jsonl`           | `adapters/copilot.ts`           |
| Kiro CLI    | `~/.kiro/sessions/cli/*.jsonl` (+ `.json` metadata) | `adapters/kiro.ts`              |
| OpenCode    | `~/.local/share/opencode/opencode.db` (SQLite)      | `adapters/opencode.ts`          |

Nambah agent baru: bikin `JsonlAdapter` yang ngubah satu baris log jadi `AgentEvent[]`
(lihat `types.ts`), daftarin di `index.ts`, tambahin warna di `apps/web/src/agents.ts`.
Mapping nama tool → animasi ada di `classify.ts`.

Sesi yang diem 3 menit jadi idle (💤), 20 menit keluar dari kantor.

## Kredit

Model robot: `RobotExpressive` oleh Tomás Laulhé (Quaternius), CC0 1.0, lewat contoh three.js
(`apps/web/public/models/robot/README.md`).

Suara mesin: rekaman CC0 dari Freesound oleh soundsofscienceupf, SoundsofTheMachine, dan
squashy555 (`apps/web/public/sounds/README.md`).

## Batasan

- Format log ini internal dan bisa berubah tiap update agent; adapter bakal perlu disesuaikan.
- Gemini cuma nulis chat log kalau sesinya disimpen; Kiro IDE (Windows) gak kebaca dari WSL,
  cuma kiro-cli.
- Status "nunggu izin" cuma kedeteksi di agent yang nulisnya ke log (Codex, Copilot).
