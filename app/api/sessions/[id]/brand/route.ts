import { NextRequest, NextResponse } from "next/server";
import { SessionNotFoundError, updateSessionBrand } from "@/lib/live/sessionRepo";
import { getBrand, resolveScreenBrandConfig } from "@/lib/brands/brandRepo";
import { requireStaff } from "@/lib/auth/routeGuard";
import { reportError } from "@/lib/reportError";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const body = await request.json();
    const brandId = body?.brand_id;
    if (!brandId || typeof brandId !== "string") {
      return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
    }

    // Archived venues (Barons Pubs) are hidden from selection; refuse them here
    // too so a stale tab cannot move a game back onto one.
    const target = await getBrand(brandId);
    if (!target) {
      return NextResponse.json({ error: "Venue not found." }, { status: 404 });
    }
    if (target.archived_at) {
      return NextResponse.json({ error: "That venue is archived. Choose The Anchor." }, { status: 400 });
    }

    await updateSessionBrand(id, brandId);
    const brand = await resolveScreenBrandConfig(brandId);
    return NextResponse.json({ brand });
  } catch (err: any) {
    // The game was not there (or went while saving): not saved, and said so.
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    await reportError({ scope: "api:session-brand:put" }, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
