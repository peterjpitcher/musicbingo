// app/api/brands/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBrand, updateBrand, deleteBrand } from "@/lib/brands/brandRepo";
import { getBrandLogoPublicUrl } from "@/lib/brands/brandStorage";
import { brandInputSchema } from "@/lib/brands/types";
import type { Brand } from "@/lib/brands/types";
import { validateEventFeedUrl } from "@/lib/brands/validation";
import { hasAdminAccess } from "@/lib/live/access";

type RouteParams = { params: Promise<{ id: string }> };

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

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
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
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const parsed = brandInputSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existingBrand = await getBrand(id);
    if (!existingBrand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const feedType = parsed.data.event_feed_type;
    const feedUrl = parsed.data.event_feed_base_url;
    const rawApiKey = typeof body.event_feed_api_key === "string" ? body.event_feed_api_key.trim() : null;

    // Validate event feed URL when provided
    const effectiveFeedType = feedType ?? existingBrand.event_feed_type;
    if (effectiveFeedType !== "none" && feedUrl) {
      const urlError = validateEventFeedUrl(feedUrl);
      if (urlError) {
        return NextResponse.json(
          { error: `event_feed_base_url: ${urlError}` },
          { status: 400 }
        );
      }
    }

    if (rawApiKey && rawApiKey.length > 500) {
      return NextResponse.json(
        { error: "event_feed_api_key must be 500 characters or fewer" },
        { status: 400 }
      );
    }

    // Completeness: non-anchor feeds require both URL and key
    if (effectiveFeedType !== "none" && effectiveFeedType !== "anchor_management") {
      const effectiveUrl = feedUrl ?? existingBrand.event_feed_base_url;
      const effectiveHasKey = rawApiKey || existingBrand.event_feed_has_key;
      if (!effectiveUrl?.trim()) {
        return NextResponse.json(
          { error: "event_feed_base_url is required for this feed type" },
          { status: 400 }
        );
      }
      if (!effectiveHasKey) {
        return NextResponse.json(
          { error: "event_feed_api_key is required for this feed type" },
          { status: 400 }
        );
      }
    }

    const dbInput: Parameters<typeof updateBrand>[1] = { ...parsed.data };

    // Include API key if explicitly provided
    if (rawApiKey) {
      dbInput.event_feed_api_key = rawApiKey;
    }

    // Clear stale key when feed is disabled or provider changes
    if (feedType) {
      const providerChanged = feedType !== existingBrand.event_feed_type;
      if (feedType === "none" && providerChanged) {
        dbInput.event_feed_api_key = null;
      } else if (providerChanged && !rawApiKey) {
        dbInput.event_feed_api_key = null;
      }
    }

    const brand = await updateBrand(id, dbInput);
    return NextResponse.json(resolveLogoUrls(brand));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    if (!hasAdminAccess(request)) {
      return NextResponse.json({ error: "Admin access required." }, { status: 401 });
    }
    const { id } = await params;
    await deleteBrand(id);
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    const status = err.message?.includes("Cannot delete") ? 409 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
