import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@anchor-nights/kit/auth/screens";

import { requestPasswordReset } from "@/app/auth/actions";
import { turnstileSiteKey } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Reset your password | Music Bingo" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage(): React.JSX.Element {
  return <ForgotPasswordScreen action={requestPasswordReset} turnstileSiteKey={turnstileSiteKey()} />;
}
