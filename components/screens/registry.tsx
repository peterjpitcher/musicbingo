import type { ReactNode } from "react";
import type { ScreenId } from "@/lib/live/runOfShow";
import type { ScreenProps } from "@/components/screens/types";
import { Welcome } from "./Welcome";
import { RunningOrder } from "./RunningOrder";
import { QuizSwitch } from "./QuizSwitch";
import { Title } from "./Title";
import { HouseRules } from "./HouseRules";
import { Warmup } from "./Warmup";
import { GameLive } from "./GameLive";
import { BreakScreen } from "./BreakScreen";
import { Winners } from "./Winners";
import { ThankYou } from "./ThankYou";
import { SysLoading } from "./SysLoading";
import { SysNotFound } from "./SysNotFound";

/**
 * Maps each run-of-show screen id to a renderer. Screens that vary by
 * game/round/type are closed over here so every entry takes the same
 * `ScreenProps`. Consumed by the guest TV (Phase 2) and the host preview
 * (Phase 3): `SCREEN_REGISTRY[runtime.screenId ?? "welcome"](props)`.
 */
export const SCREEN_REGISTRY: Record<ScreenId, (props: ScreenProps) => ReactNode> = {
  welcome: (p) => <Welcome {...p} />,
  order: (p) => <RunningOrder {...p} />,
  quiz1: (p) => <QuizSwitch {...p} round="One" />,
  title: (p) => <Title {...p} />,
  rules: (p) => <HouseRules {...p} />,
  dance: (p) => <Warmup {...p} type="dance" />,
  game1: (p) => <GameLive {...p} game={1} />,
  break: (p) => <BreakScreen {...p} />,
  quiz2: (p) => <QuizSwitch {...p} round="Two" />,
  sing: (p) => <Warmup {...p} type="sing" />,
  game2: (p) => <GameLive {...p} game={2} />,
  winners: (p) => <Winners {...p} />,
  thanks: (p) => <ThankYou {...p} />,
  "sys-load": (p) => <SysLoading {...p} />,
  "sys-none": (p) => <SysNotFound {...p} />,
};
