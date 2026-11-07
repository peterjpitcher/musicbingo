// app/api/brands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listBrands, createBrand } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { brandInputSchema } from "@/lib/brands/types";
import type { Brand } from "@/lib/brands/types";
import { validateEventFeedUrl } from "@/lib/brands/validation";
import { requireStaff } from "@/lib/auth/routeGuard";
import { reportError } from "@/lib/reportError";

function resolveLogoUrls(
  brand: Brand
): Brand & {
  logo_dark_public_url: string;
  logo_light_public_url: string;
  event_logo_public_url: string | null;
} {
  return {
    ...brand,
    logo_dark_public_url: getBrandLogoPublicUrl(brand.logo_dark_url),
    logo_light_public_url: getBrandLogoPublicUrl(brand.logo_light_url),
    // event_logo_url is a Storage object key; resolve it to a public URL so the
    // editor thumbnail (and any consumer) gets a usable src instead of the key.
    event_logo_public_url: brand.event_logo_url
      ? getBrandLogoPublicUrl(brand.event_logo_url)
      : null,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const brands = await listBrands();
    return NextResponse.json(brands.map(resolveLogoUrls));
  } catch (err: any) {
    await reportError({ scope: "api:brands:get" }, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const gate = await requireStaff(request);
    if (!gate.ok) return gate.response;
    const body = await request.json();
    const parsed = brandInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Validate event feed configuration
    const { event_feed_type, event_feed_base_url } = parsed.data;
    // The feed key is no longer stored on a venue (spec M-7): it comes from
    // ANCHOR_API_KEY on the server. Any event_feed_api_key sent is ignored.

    if (event_feed_type && event_feed_type !== "none") {
      if (event_feed_base_url) {
        const urlError = validateEventFeedUrl(event_feed_base_url);
        if (urlError) {
          return NextResponse.json(
            { error: `event_feed_base_url: ${urlError}` },
            { status: 400 }
          );
        }
      }

      // Non-anchor feeds need their own URL.
      if (event_feed_type !== "anchor_management") {
        if (!event_feed_base_url?.trim()) {
          return NextResponse.json(
            { error: "event_feed_base_url is required for this feed type" },
            { status: 400 }
          );
        }
      }
    }

    const dbInput: Parameters<typeof createBrand>[0] = { ...parsed.data };

    const brand = await createBrand(dbInput);
    return NextResponse.json(resolveLogoUrls(brand), { status: 201 });
  } catch (err: any) {
    await reportError({ scope: "api:brands:post" }, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
