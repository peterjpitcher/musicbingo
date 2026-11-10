"use server";

import type { PairingFormState } from "@anchor-nights/kit/pairing/shared";

import { tvPairing } from "@/lib/tv-pairing";

// The kit's TV pairing as this app's Server Actions (spec M-9). Each checks
// on the server that the caller is active staff (pairing: host or admin;
// removing a TV: admin), and the database checks again.

export async function pairTv(previous: PairingFormState, formData: FormData): Promise<PairingFormState> {
  return tvPairing().actions.pairTv(previous, formData);
}

export async function revokeTv(previous: PairingFormState, formData: FormData): Promise<PairingFormState> {
  return tvPairing().actions.revokeTv(previous, formData);
}
