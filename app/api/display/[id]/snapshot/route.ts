import { NextRequest, NextResponse } from "next/server";

import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { resolveBrandConfig } from "@/lib/brands/brandRepo";
import { hasSessionAccess } from "@/lib/live/access";
import { getRuntimeState, getSession } from "@/lib/live/sessionRepo";
import { makeEmptyRuntimeState } from "@/lib/live/types";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    if (!hasSessionAccess(request, id, "display")) {
      return NextResponse.json({ error: "Private display access required." }, { status: 401 });
    }

    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const [runtimeState, brand] = await Promise.all([
      getRuntimeState(id),
      resolveBrandConfig(session.brandId ?? null),
    ]);

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
        brand: brandWithUrls,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load display snapshot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
