import { NextRequest, NextResponse } from "next/server";

import { deleteSession, getSession } from "@/lib/live/sessionRepo";
import { resolveBrandConfig } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    const brand = await resolveBrandConfig(session.brandId ?? null);
    // Resolve logo URLs server-side so client components (screens) can use them
    // directly. event_logo_url is a Storage object key too — the Title screen
    // binds it raw as an <img src>, so it must be resolved here as well.
    const brandWithUrls = brand ? {
      ...brand,
      logo_dark_url: getBrandLogoPublicUrl(brand.logo_dark_url),
      logo_light_url: getBrandLogoPublicUrl(brand.logo_light_url),
      event_logo_url: brand.event_logo_url
        ? getBrandLogoPublicUrl(brand.event_logo_url)
        : null,
    } : null;
    return NextResponse.json({ ...session, brand: brandWithUrls }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to get session." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSession(id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to delete session." }, { status: 500 });
  }
}
