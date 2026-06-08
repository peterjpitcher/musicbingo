"use client";

import { useEffect, useState } from "react";
import type { LiveScoreToast } from "@/lib/live/types";

type ScoreToastOverlayProps = {
  toast: LiveScoreToast | null | undefined;
};

const SCORE_TOAST_MS = 5_500;

export function ScoreToastOverlay({ toast }: ScoreToastOverlayProps): JSX.Element | null {
  const [hiddenToastId, setHiddenToastId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const elapsedMs = Date.now() - toast.createdAtMs;
    const remainingMs = Math.max(0, SCORE_TOAST_MS - elapsedMs);
    const timer = window.setTimeout(() => setHiddenToastId(toast.id), remainingMs);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast || hiddenToastId === toast.id) {
    return null;
  }

  return (
    <div className="score-toast" role="status" aria-live="polite">
      <div className="score-toast__label">{toast.label}</div>
      <div className="score-toast__main">
        {toast.teamName} +{toast.points} points
      </div>
      <div className="score-toast__total">{toast.total} total</div>
    </div>
  );
}
