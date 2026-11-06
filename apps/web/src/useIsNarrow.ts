import { useSyncExternalStore } from "react";

const NARROW = "(max-width: 767px)";
const subscribe = (onChange: () => void) => {
  const media = matchMedia(NARROW);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/** Layout follows viewport width; touch target density is independently styled by pointer: coarse. */
export const useIsNarrow = () => useSyncExternalStore(subscribe, () => matchMedia(NARROW).matches);
