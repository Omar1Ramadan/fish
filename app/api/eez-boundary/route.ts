import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [EEZ BOUNDARY API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [EEZ BOUNDARY API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [EEZ BOUNDARY API] ❌ ${message}`, error);
};

// Map MRGID to geoname for Marine Regions WFS lookup
// Source: https://www.marineregions.org/eezsearch.php
const REGION_INFO: Record<string, { name: string; geoname: string }> = {
  "8403": { name: "Ecuador (Galapagos)", geoname: "Ecuadorian" },
  "8454": { name: "Peru", geoname: "Peruvian" },
  "8447": { name: "Chile", geoname: "Chilean" },
  "8466": { name: "Argentina", geoname: "Argentine" },
  "8373": { name: "Guinea", geoname: "Guinean Exclusive" },
  "8492": { name: "Australia", geoname: "Australian" },
  "8488": { name: "Japan", geoname: "Japanese" },
};

// Marine Regions WFS endpoint
const MARINE_REGIONS_WFS = "https://geo.vliz.be/geoserver/wfs";

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🗺️ Incoming EEZ boundary request");

  const searchParams = request.nextUrl.searchParams;
  const regionId = searchParams.get("region-id");

  if (!regionId) {
    return NextResponse.json(
      { error: "Missing required parameter: region-id" },
      { status: 400 }
    );
  }

  try {
    // Map region ID to Marine Regions info
    const regionInfo = REGION_INFO[regionId];

    if (!regionInfo) {
      log("⚠️ No mapping for region ID", { regionId });
      return NextResponse.json(
        {
          error: "Region not found",
          regionId,
          availableRegions: Object.keys(REGION_INFO),
        },
        { status: 404 }
      );
    }

    log("🌍 Fetching boundary from Marine Regions", { regionId, regionInfo });

    // Fetch from Marine Regions WFS using geoname search
    const wfsUrl = new URL(MARINE_REGIONS_WFS);
    wfsUrl.searchParams.set("service", "WFS");
    wfsUrl.searchParams.set("version", "1.1.0");
    wfsUrl.searchParams.set("request", "GetFeature");
    wfsUrl.searchParams.set("outputFormat", "application/json");
    wfsUrl.searchParams.set("typeName", "MarineRegions:eez");
    wfsUrl.searchParams.set("CQL_FILTER", `geoname LIKE '%${regionInfo.geoname}%'`);

    log("📤 Requesting from Marine Regions WFS", { 
      geoname: regionInfo.geoname 
    });

    const response = await fetch(wfsUrl.toString());

    if (!response.ok) {
      logError("Marine Regions WFS error", { status: response.status });
      return NextResponse.json(
        {
          error: "Failed to fetch from Marine Regions",
          status: response.status,
        },
        { status: response.status }
      );
    }

    const geoJson = await response.json();

    log("✅ Boundary fetched from Marine Regions", {
      features: geoJson.features?.length || 0,
    });

    // If multiple features returned, use the first one (main EEZ)
    if (geoJson.features && geoJson.features.length > 1) {
      log("⚠️ Multiple features returned, using first one");
      geoJson.features = [geoJson.features[0]];
    }

    return NextResponse.json({
      ...geoJson,
      metadata: {
        source: "Marine Regions (marineregions.org)",
        regionId,
        regionName: regionInfo.name,
      },
    });
  } catch (error) {
    logError("Exception while fetching boundary:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
