"use client";

import { SignOutButton } from "@anchor-nights/kit/auth/screens";
import { buttonClass } from "@anchor-nights/kit/ui";

import { signOut } from "@/app/auth/actions";

/** The signed-in staff member's own links in the top bar: their account page and sign out (a POST, never a link). */
export function AccountActions(): React.JSX.Element {
  return (
    <>
      <a href="/account" className={buttonClass({ variant: "outline", size: "sm" })}>
        Account
      </a>
      <SignOutButton action={signOut} />
    </>
  );
}
