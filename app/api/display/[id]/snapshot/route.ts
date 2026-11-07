import { NextRequest, NextResponse } from "next/server";

import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { resolveScreenBrandConfig } from "@/lib/brands/brandRepo";
import { requireStaff } from "@/lib/auth/routeGuard";
import { authoriseDisplay } from "@/lib/live/displayAccess";
import { getSessionRecord } from "@/lib/live/sessionRepo";
import { makeEmptyRuntimeState } from "@/lib/live/types";
import { reportError } from "@/lib/reportError";
import { tvPairing } from "@/lib/tv-pairing";

export const runtime = "nodejs";

/**
 * What the TV draws: the game, its runtime and the runtime's version (the TV
 * drops anything older than what it shows by this number, spec M-9). Open to
 * the game's TV link, a paired TV for tonight's game, or a signed-in host or
 * admin (lib/live/displayAccess.ts).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const gate = await authoriseDisplay(request, id, {
      loadRecord: getSessionRecord,
      requirePairedTv: (req) => tvPairing().requirePairedTv(req),
      requireStaff,
    });
    if (!gate.ok) return gate.response;
    const { session, runtime: runtimeState, runtimeVersion } = gate.record;

    const brand = await resolveScreenBrandConfig(session.brandId ?? null);
    const brandWithUrls = brand ? {
      ...brand,
      logo_dark_url: getBrandLogoPublicUrl(brand.logo_dark_url),
      logo_light_url: getBrandLogoPublicUrl(brand.logo_light_url),
      event_logo_url: brand.event_logo_url
        ? getBrandLogoPublicUrl(brand.event_logo_url)
        : null,
    } : null;

    return NextResponse.json(
      {
        session,
        runtime: runtimeState ?? makeEmptyRuntimeState(id),
        runtimeVersion,
        brand: brandWithUrls,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    await reportError({ scope: "api:display-snapshot:get" }, err);
    return NextResponse.json({ error: "Failed to load display snapshot." }, { status: 500 });
  }
}
