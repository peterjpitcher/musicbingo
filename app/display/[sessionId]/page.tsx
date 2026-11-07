"use client";

import { useParams } from "next/navigation";

import { LiveDisplay } from "@/components/display/LiveDisplay";

/**
 * The private TV display for one game, opened from a TV link (which set the
 * game's link cookie) or by a signed-in host. A paired TV uses /tv instead,
 * which finds tonight's game by itself (spec M-9).
 */
export default function PrivateDisplayPage(): React.JSX.Element {
  const params = useParams<{ sessionId: string }>();
  const sessionId = typeof params?.sessionId === "string" ? params.sessionId : "";
  return <LiveDisplay sessionId={sessionId} />;
}
