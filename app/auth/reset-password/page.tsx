import type { Metadata } from "next";
import { ResetPasswordScreen } from "@anchor-nights/kit/auth/screens";

import { resetPassword } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Choose a new password | Music Bingo" };
export const dynamic = "force-dynamic";

/** Needs the 10-minute recovery grant cookie that /auth/confirm sets; an ordinary session cannot use it. */
export default function ResetPasswordPage(): React.JSX.Element {
  return <ResetPasswordScreen action={resetPassword} />;
}
