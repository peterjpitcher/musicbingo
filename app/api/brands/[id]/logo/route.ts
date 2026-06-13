// app/api/brands/[id]/logo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBrand, updateBrand } from "@/lib/brands/brandRepo";
import { uploadBrandLogo, type LogoSlot } from "@/lib/brands/brandStorage";
import { hasAdminAccess } from "@/lib/live/access";

type RouteParams = { params: Promise<{ id: string }> };

/** Maps each upload slot to the brand column that stores its object key. */
const SLOT_FIELD: Record<LogoSlot, "logo_dark_url" | "logo_light_url" | "event_logo_url"> = {
  "logo-dark": "logo_dark_url",
  "logo-light": "logo_light_url",
  "event-logo": "event_logo_url",
};

function isLogoSlot(value: string | null): value is LogoSlot {
  return value === "logo-dark" || value === "logo-light" || value === "event-logo";
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const { id } = await params;
    const brand = await getBrand(id);
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slot = formData.get("slot") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (!isLogoSlot(slot)) {
      return NextResponse.json(
        { error: "slot must be 'logo-dark', 'logo-light', or 'event-logo'" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const objectKey = await uploadBrandLogo(id, slot, buffer, file.type);

    // Update the brand row with the new object key
    await updateBrand(id, { [SLOT_FIELD[slot]]: objectKey });

    return NextResponse.json({ objectKey });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
