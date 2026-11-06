import { useSyncExternalStore } from "react";

/**
 * Phone width, matching Tailwind's `md` breakpoint so CSS classes and this hook agree about
 * what counts as a phone. Shared because both the HUD and the Settings dialog lay out
 * differently below it.
 */
const PHONE = "(max-width: 767px)";

export const useIsPhone = () =>
  useSyncExternalStore(
    (onChange) => {
      const m = matchMedia(PHONE);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => matchMedia(PHONE).matches,
  );
