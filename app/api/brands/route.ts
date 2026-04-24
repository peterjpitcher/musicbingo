// app/api/brands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listBrands, createBrand } from "@/lib/brands/brandRepo";
import { brandInputSchema } from "@/lib/brands/types";

export async function GET(): Promise<NextResponse> {
  try {
    const brands = await listBrands();
    return NextResponse.json(brands);
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
    return NextResponse.json(brand, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
