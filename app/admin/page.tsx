import type { Metadata } from "next";
import Link from "next/link";
import { InvitePanel, StaffPanel } from "@anchor-nights/kit/auth/screens";
import { TvDevicesPanel } from "@anchor-nights/kit/pairing/screens";
import { Banner, buttonClass } from "@anchor-nights/kit/ui";

import { cancelInvite, changeRole, deactivateUser, issueInvite, reactivateUser, revokeSessions } from "@/app/admin/actions";
import { revokeTv } from "@/app/tv/actions";
import { AppHeader } from "@/components/layout/AppHeader";
import { ADMIN_ROLES, adminActions, authHelpers } from "@/lib/auth/server";
import { tvPairing } from "@/lib/tv-pairing";

export const metadata: Metadata = { title: "Staff | Music Bingo" };
export const dynamic = "force-dynamic";

/**
 * Staff management (admins only; proxy.ts and requireRole both check):
 * invite someone by a copied link, cancel an invite, change a role, sign
 * someone out everywhere, deactivate a leaver or give access back, and remove
 * a paired pub TV (M-9). This page replaced the shared admin-secret unlock
 * page in M-8.
 */
export default async function StaffAdminPage(): Promise<React.JSX.Element> {
  const { user } = await authHelpers().requireRole(ADMIN_ROLES);
  const admin = adminActions();

  let invites: Awaited<ReturnType<typeof admin.listInvites>> = null;
  let staff: Awaited<ReturnType<typeof admin.listStaff>> = null;
  let tvs: Awaited<ReturnType<ReturnType<typeof tvPairing>["actions"]["listTvDevices"]>> = null;
  let loadFailed = false;
  let tvsFailed = false;
  try {
    [invites, staff] = await Promise.all([admin.listInvites(), admin.listStaff()]);
  } catch {
    loadFailed = true;
  }
  try {
    tvs = await tvPairing().actions.listTvDevices();
  } catch {
    tvsFailed = true;
  }

  return (
    <div className="host-root theme-desk">
      <AppHeader
        title="Music Bingo"
        subtitle="Staff"
        actions={
          <Link href="/host" className={buttonClass({ variant: "outline", size: "sm" })}>
            Games
          </Link>
        }
      />
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-8 sm:py-12">
        {loadFailed ? (
          <Banner tone="danger">We could not load the staff list just now. Refresh the page to try again.</Banner>
        ) : null}
        <InvitePanel
          issueAction={issueInvite}
          cancelAction={cancelInvite}
          invites={(invites ?? []).map(({ id, email, role, status, expiresAt }) => ({ id, email, role, status, expiresAt }))}
        />
        {staff ? (
          <StaffPanel
            staff={staff.map(({ userId, email, role, active, deactivatedAt }) => ({ userId, email, role, active, deactivatedAt }))}
            currentUserId={user.id}
            changeRoleAction={changeRole}
            deactivateAction={deactivateUser}
            reactivateAction={reactivateUser}
            revokeSessionsAction={revokeSessions}
          />
        ) : null}
        {tvsFailed ? (
          <Banner tone="danger">We could not load the paired TVs just now. Refresh the page to try again.</Banner>
        ) : (
          <TvDevicesPanel devices={tvs ?? []} revokeAction={revokeTv} />
        )}
      </main>
    </div>
  );
}
