import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 767px)";
const subscribe = (onChange: () => void) => {
  const media = matchMedia(PHONE);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/** Match the HUD's phone layout and update when the viewport changes. */
export const useIsPhone = () => useSyncExternalStore(subscribe, () => matchMedia(PHONE).matches);
