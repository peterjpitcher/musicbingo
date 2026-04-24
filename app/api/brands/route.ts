// app/api/brands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listBrands, createBrand } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { brandInputSchema } from "@/lib/brands/types";
import type { Brand } from "@/lib/brands/types";

function resolveLogoUrls(brand: Brand): Brand & { logo_dark_public_url: string; logo_light_public_url: string } {
  return {
    ...brand,
    logo_dark_public_url: getBrandLogoPublicUrl(brand.logo_dark_url),
    logo_light_public_url: getBrandLogoPublicUrl(brand.logo_light_url),
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const brands = await listBrands();
    return NextResponse.json(brands.map(resolveLogoUrls));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const parsed = brandInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const brand = await createBrand(parsed.data);
    return NextResponse.json(resolveLogoUrls(brand), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
