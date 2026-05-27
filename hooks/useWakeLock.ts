import { useCallback, useEffect, useRef, useState } from "react";
import NoSleep from "nosleep.js";

type ScreenWakeLockSentinel = {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockCapableNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<ScreenWakeLockSentinel>;
  };
};

/**
 * Keeps mobile screens awake using the native wake lock API where available,
 * with a no-sleep fallback for browsers like iOS Safari.
 */
export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null);
  const noSleepRef = useRef<NoSleep | null>(null);

  const enableWakeLock = useCallback(async () => {
    const wakeLock = (navigator as WakeLockCapableNavigator).wakeLock;
    if (wakeLock) {
      try {
        const sentinel = await wakeLock.request("screen");
        wakeLockRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
            setIsLocked(false);
          }
        });
        setIsLocked(true);
      } catch {
        wakeLockRef.current = null;
        setIsLocked(false);
      }
      return;
    }

    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }
    try {
      await noSleepRef.current.enable();
      setIsLocked(true);
    } catch {
      setIsLocked(false);
    }
  }, []);

  const disableWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      void sentinel.release().catch(() => {});
      setIsLocked(false);
    }
    if (!noSleepRef.current) {
      setIsLocked(false);
      return;
    }
    noSleepRef.current.disable();
    setIsLocked(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isUnmounted = false;

    const requestWakeLock = async () => {
      if (isUnmounted || document.visibilityState !== "visible") return;
      await enableWakeLock();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        disableWakeLock();
      }
    };

    const handlePageActivation = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current && !noSleepRef.current?.isEnabled) {
        void requestWakeLock();
      }
    };

    const handleUserInteraction = () => {
      if (!wakeLockRef.current && !noSleepRef.current?.isEnabled) {
        void requestWakeLock();
      }
    };

    void requestWakeLock();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handlePageActivation);
    window.addEventListener("pageshow", handlePageActivation);
    document.addEventListener("click", handleUserInteraction, { passive: true });
    document.addEventListener("touchstart", handleUserInteraction, { passive: true });
    document.addEventListener("keydown", handleUserInteraction);

    const keepAliveInterval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !wakeLockRef.current && !noSleepRef.current?.isEnabled) {
        void requestWakeLock();
      }
    }, 15_000);

    return () => {
      isUnmounted = true;
      window.clearInterval(keepAliveInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handlePageActivation);
      window.removeEventListener("pageshow", handlePageActivation);
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("keydown", handleUserInteraction);
      disableWakeLock();
    };
  }, [disableWakeLock, enableWakeLock]);

  return { isLocked };
}
