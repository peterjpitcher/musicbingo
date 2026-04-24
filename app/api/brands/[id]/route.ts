// app/api/brands/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBrand, updateBrand, deleteBrand } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { brandInputSchema } from "@/lib/brands/types";
import type { Brand } from "@/lib/brands/types";

type RouteParams = { params: Promise<{ id: string }> };

function resolveLogoUrls(brand: Brand): Brand & { logo_dark_public_url: string; logo_light_public_url: string } {
  return {
    ...brand,
    logo_dark_public_url: getBrandLogoPublicUrl(brand.logo_dark_url),
    logo_light_public_url: getBrandLogoPublicUrl(brand.logo_light_url),
  };
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const brand = await getBrand(id);
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    return NextResponse.json(resolveLogoUrls(brand));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = brandInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const brand = await updateBrand(id, parsed.data);
    return NextResponse.json(resolveLogoUrls(brand));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    await deleteBrand(id);
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    const status = err.message?.includes("Cannot delete") ? 409 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
