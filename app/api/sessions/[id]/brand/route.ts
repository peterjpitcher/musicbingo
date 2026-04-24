import { NextRequest, NextResponse } from "next/server";
import { updateSessionBrand } from "@/lib/live/sessionRepo";
import { resolveBrandConfig } from "@/lib/brands/brandRepo";

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const brandId = body?.brand_id;
    if (!brandId || typeof brandId !== "string") {
      return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
    }

    await updateSessionBrand(id, brandId);
    const brand = await resolveBrandConfig(brandId);
    return NextResponse.json({ brand });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
