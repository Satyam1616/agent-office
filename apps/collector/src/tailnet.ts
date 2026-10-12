import { existsSync } from "node:fs";

/** One of your own devices on the tailnet. */
export interface Device {
  name: string;
  /** MagicDNS name, e.g. laptop.tail1234.ts.net */
  dns: string;
  ip: string;
  os: string;
  online: boolean;
}

interface Status {
  BackendState: string;
  Self: Node;
  Peer?: Record<string, Node>;
}
interface Node {
  HostName: string;
  DNSName: string;
  OS: string;
  TailscaleIPs?: string[];
  Online: boolean;
  UserID: number;
}

const CLI =
  process.platform === "win32"
    ? ["C:\\Program Files\\Tailscale\\tailscale.exe", "tailscale.exe"]
    : process.platform === "darwin"
      ? ["/Applications/Tailscale.app/Contents/MacOS/Tailscale", "tailscale"]
      : ["tailscale"];

/** Full paths are checked as files, bare names looked up on PATH. */
const cli = () => CLI.find((c) => (/[\\/]/.test(c) ? existsSync(c) : Bun.which(c))) ?? null;

/**
 * Who's who on the tailnet, from `tailscale status --json`. Tailscale already
 * signed every device in, so "same user as this machine" is our trust rule:
 * no extra login, and devices of people you share the tailnet with stay out.
 */
export class Tailnet {
  private devices: Device[] = [];
  private ownIPs = new Set<string>();
  private selfIPs = new Set<string>();
  /** Why there's no device list, if there isn't one. */
  problem?: string = "not checked yet";

  async refresh(): Promise<void> {
    const bin = cli();
    if (!bin) {
      this.problem = "Tailscale isn't installed on this computer";
      return this.clear();
    }
    let st: Status;
    try {
      const proc = Bun.spawn([bin, "status", "--json"], { stdout: "pipe", stderr: "ignore", windowsHide: true });
      st = JSON.parse(await new Response(proc.stdout).text());
    } catch {
      this.problem = "Tailscale isn't running";
      return this.clear();
    }
    if (st.BackendState !== "Running") {
      this.problem = `Tailscale is ${st.BackendState.toLowerCase()}`;
      return this.clear();
    }
    this.problem = undefined;
    const me = st.Self.UserID;
    const v4 = (n: Node) => n.TailscaleIPs?.find((ip) => ip.includes("."));
    // Tagged devices (servers) have no user; only devices signed in as you count.
    const mine = Object.values(st.Peer ?? {}).filter((n) => n.UserID === me && v4(n));
    this.devices = mine.map((n) => ({
      name: n.HostName,
      dns: n.DNSName.replace(/\.$/, ""),
      ip: v4(n)!,
      os: n.OS,
      online: n.Online,
    }));
    this.ownIPs = new Set(mine.flatMap((n) => n.TailscaleIPs ?? []));
    this.selfIPs = new Set(st.Self.TailscaleIPs ?? []);
  }

  private clear() {
    this.devices = [];
    this.ownIPs.clear();
    this.selfIPs.clear();
  }

  /** Your other devices (not this one). */
  list(): Device[] {
    return this.devices;
  }

  /** Is this connecting address one of your own devices (or this machine)? */
  isMine(ip: string): boolean {
    const plain = ip.replace(/^::ffff:/, "");
    return this.ownIPs.has(plain) || this.selfIPs.has(plain);
  }
}
