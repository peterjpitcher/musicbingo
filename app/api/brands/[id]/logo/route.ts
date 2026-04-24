// app/api/brands/[id]/logo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBrand, updateBrand } from "@/lib/brands/brandRepo";
import { uploadBrandLogo } from "@/lib/brands/brandStorage";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const brand = await getBrand(id);
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slot = formData.get("slot") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (slot !== "logo-dark" && slot !== "logo-light") {
      return NextResponse.json({ error: "slot must be 'logo-dark' or 'logo-light'" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const objectKey = await uploadBrandLogo(id, slot, buffer, file.type);

    // Update the brand row with the new object key
    const field = slot === "logo-dark" ? "logo_dark_url" : "logo_light_url";
    await updateBrand(id, { [field]: objectKey });

    return NextResponse.json({ objectKey });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
