import { Html as DreiHtml } from "@react-three/drei";
import type { ComponentProps } from "react";

// Keep Drei's nested DOM root attached to one stable target. Its default target
// changes when the R3F event manager connects, which can unmount that root mid-commit.
const portal = {
  current: typeof document === "undefined" ? (null as unknown as HTMLElement) : document.body,
};

export function Html(props: ComponentProps<typeof DreiHtml>) {
  return <DreiHtml {...props} portal={portal} />;
}
