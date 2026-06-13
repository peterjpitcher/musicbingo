// app/api/brands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listBrands, createBrand } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { brandInputSchema } from "@/lib/brands/types";
import type { Brand } from "@/lib/brands/types";
import { validateEventFeedUrl } from "@/lib/brands/validation";
import { hasAdminAccess } from "@/lib/live/access";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const brands = await listBrands();
    return NextResponse.json(brands.map(resolveLogoUrls));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
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
    const rawApiKey = typeof body.event_feed_api_key === "string" ? body.event_feed_api_key.trim() : null;

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

      // Non-anchor feeds require both URL and key (mirrors DB CHECK constraint)
      if (event_feed_type !== "anchor_management") {
        if (!event_feed_base_url?.trim()) {
          return NextResponse.json(
            { error: "event_feed_base_url is required for this feed type" },
            { status: 400 }
          );
        }
        if (!rawApiKey) {
          return NextResponse.json(
            { error: "event_feed_api_key is required for this feed type" },
            { status: 400 }
          );
        }
      }
    }

    if (rawApiKey && rawApiKey.length > 500) {
      return NextResponse.json(
        { error: "event_feed_api_key must be 500 characters or fewer" },
        { status: 400 }
      );
    }

    const dbInput: Parameters<typeof createBrand>[0] = {
      ...parsed.data,
      event_feed_api_key: rawApiKey || null,
    };

    const brand = await createBrand(dbInput);
    return NextResponse.json(resolveLogoUrls(brand), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
