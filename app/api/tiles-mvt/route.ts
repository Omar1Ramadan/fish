import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy MVT (Mapbox Vector Tiles) from GFW 4Wings API
 * 
 * MVT tiles contain vector features for each grid cell
 * Used for click interaction - queryRenderedFeatures gets cell IDs
 * 
 * Source layer name: "default" (confirmed from GFW API documentation)
 */

const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [TILES-MVT] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [TILES-MVT] ${message}`);
  }
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const startDate = searchParams.get("start") || "2024-01-01";
  const endDate = searchParams.get("end") || "2024-12-31";
  const interval = searchParams.get("interval") || "DAY";

  if (!z || !x || !y) {
    return NextResponse.json({ error: "z, x, y required" }, { status: 400 });
  }

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    return NextResponse.json({ error: "API token not configured" }, { status: 500 });
  }

  // Build GFW MVT tile URL
  // Note: format=MVT returns Mapbox Vector Tiles
  const params = new URLSearchParams();
  params.set("format", "MVT");
  params.set("interval", interval);
  params.set("datasets[0]", "public-global-fishing-effort:latest");
  params.set("date-range", `${startDate},${endDate}`);
  params.set("temporal-aggregation", "true"); // Aggregate all time data into single layer

  const tileUrl = `https://gateway.api.globalfishingwatch.org/v3/4wings/tile/heatmap/${z}/${x}/${y}?${params.toString()}`;

  log("🔷 MVT tile request", { z, x, y, url: tileUrl.substring(0, 120) + "..." });

  try {
    const response = await fetch(tileUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/x-protobuf",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Empty tile - return 204 No Content
        log("⚪ Empty MVT tile", { z, x, y });
        return new NextResponse(null, { status: 204 });
      }
      const errorText = await response.text();
      log("❌ GFW MVT error", { status: response.status, error: errorText.substring(0, 100) });
      return new NextResponse(null, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    
    log("✅ MVT tile OK", { z, x, y, size: arrayBuffer.byteLength });

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/x-protobuf",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    log("❌ Exception fetching MVT", error);
    return new NextResponse(null, { status: 500 });
  }
}
