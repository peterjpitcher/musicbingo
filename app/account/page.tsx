import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm } from "@anchor-nights/kit/auth/screens";
import { buttonClass, Card } from "@anchor-nights/kit/ui";

import { changePassword } from "@/app/auth/actions";
import { AppHeader } from "@/components/layout/AppHeader";
import { authHelpers, STAFF_ROLES, turnstileSiteKey } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Your account | Music Bingo" };
export const dynamic = "force-dynamic";

/** The signed-in staff member's own page: who they are, change password, and (admins) the staff page. */
export default async function AccountPage(): Promise<React.JSX.Element> {
  const { user, role } = await authHelpers().requireRole(STAFF_ROLES);
  return (
    <div className="host-root theme-desk">
      <AppHeader
        title="Music Bingo"
        subtitle="Your account"
        actions={
          <>
            <Link href="/host" className={buttonClass({ variant: "outline", size: "sm" })}>
              Games
            </Link>
            {role === "admin" ? (
              <Link href="/admin" className={buttonClass({ variant: "outline", size: "sm" })}>
                Staff
              </Link>
            ) : null}
          </>
        }
      />
      <main className="mx-auto flex w-full max-w-[520px] flex-col gap-6 px-4 py-8 sm:py-12">
        <Card className="px-5 py-6">
          <p className="m-0 font-sans text-[15px]">
            Signed in as <strong className="break-all">{user.email}</strong> ({role === "admin" ? "admin" : "host"}).
          </p>
        </Card>
        <ChangePasswordForm action={changePassword} turnstileSiteKey={turnstileSiteKey()} />
      </main>
    </div>
  );
}
