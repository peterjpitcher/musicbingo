"use server";

import type { AuthFormState } from "@anchor-nights/kit/auth";

import { adminActions as admin } from "@/lib/auth/server";

// The kit's staff management as this app's Server Actions. Each action checks
// again, on the server, that the caller is an active admin; the panels only
// collect the request.

export async function issueInvite(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return admin().issueInvite(previous, formData);
}

export async function cancelInvite(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return admin().cancelInvite(previous, formData);
}

export async function changeRole(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return admin().changeRole(previous, formData);
}

export async function deactivateUser(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return admin().deactivateUser(previous, formData);
}

export async function reactivateUser(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return admin().reactivateUser(previous, formData);
}

export async function revokeSessions(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return admin().revokeSessions(previous, formData);
}
