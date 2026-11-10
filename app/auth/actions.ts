"use server";

import { createAuthActions, type AuthActions, type AuthFormState } from "@anchor-nights/kit/auth";

import { authDeps } from "@/lib/auth/server";

// The kit's sign-in flows as this app's Server Actions (Next needs the
// 'use server' file to live in the app). Each one runs on the server only:
// Turnstile tokens are forwarded to Supabase, failures are rate limited and
// audited, and a dependency that is down is reported to the user, never
// shown as a success (kit README, "Sign-in adoption").

let actions: AuthActions | null = null;
function auth(): AuthActions {
  actions ??= createAuthActions(authDeps());
  return actions;
}

export async function signIn(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return auth().signIn(previous, formData);
}

export async function signOut(): Promise<AuthFormState> {
  return auth().signOut();
}

export async function requestPasswordReset(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return auth().requestPasswordReset(previous, formData);
}

export async function confirmRecovery(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return auth().confirmRecovery(previous, formData);
}

export async function resetPassword(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return auth().resetPassword(previous, formData);
}

export async function changePassword(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return auth().changePassword(previous, formData);
}

export async function acceptInvite(previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return auth().acceptInvite(previous, formData);
}
