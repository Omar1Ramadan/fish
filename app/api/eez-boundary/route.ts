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

// Map GFW region IDs to Marine Regions EEZ names
// Marine Regions is the authoritative source used by GFW for EEZ boundaries
// See: https://www.marineregions.org/
const REGION_NAME_MAP: Record<string, string> = {
  "555635930": "Galapagos", // Galapagos Marine Reserve
  "555745302": "Peru", // Dorsal de Nasca MPA
  "5690": "Russia", // Russian EEZ
  "8465": "Chile", // Chile EEZ
  "8492": "Indonesia", // Indonesia EEZ
  "555745303": "Costa Rica", // Cocos Island
  "555745304": "Colombia", // Malpelo MPA
};

// Marine Regions WFS endpoint
const MARINE_REGIONS_WFS = "https://geo.vliz.be/geoserver/wfs";

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🗺️ Incoming EEZ boundary request");

  const searchParams = request.nextUrl.searchParams;
  const regionId = searchParams.get("region-id");
  const bufferValue = searchParams.get("buffer-value");
  const bufferUnit = searchParams.get("buffer-unit") || "NAUTICALMILES";

  if (!regionId) {
    return NextResponse.json(
      { error: "Missing required parameter: region-id" },
      { status: 400 }
    );
  }

  try {
    // Map GFW region ID to Marine Regions EEZ name
    const regionName = REGION_NAME_MAP[regionId];
    
    if (!regionName) {
      log("⚠️ No Marine Regions mapping for region ID", { regionId });
      return NextResponse.json(
        { 
          error: "Region not found in mapping",
          regionId,
          note: "This region ID is not yet mapped to a Marine Regions EEZ name"
        },
        { status: 404 }
      );
    }

    log("🌍 Fetching EEZ boundary from Marine Regions", { regionId, regionName });

    // Fetch from Marine Regions WFS
    // Using GetFeature request to get EEZ boundaries
    const wfsUrl = new URL(MARINE_REGIONS_WFS);
    wfsUrl.searchParams.set("service", "WFS");
    wfsUrl.searchParams.set("version", "1.1.0");
    wfsUrl.searchParams.set("request", "GetFeature");
    wfsUrl.searchParams.set("typeName", "eez");
    wfsUrl.searchParams.set("outputFormat", "application/json");
    wfsUrl.searchParams.set("CQL_FILTER", `geoname LIKE '%${regionName}%'`);

    log("📤 Requesting from Marine Regions WFS", { url: wfsUrl.toString() });

    const response = await fetch(wfsUrl.toString());
    
    if (!response.ok) {
      logError("Marine Regions WFS error", { status: response.status });
      return NextResponse.json(
        { error: "Failed to fetch from Marine Regions", status: response.status },
        { status: response.status }
      );
    }

    const geoJson = await response.json();
    
    log("✅ Boundary fetched from Marine Regions", { 
      features: geoJson.features?.length || 0 
    });

    // Apply buffer if specified (simplified - would need proper geometric buffer in production)
    if (bufferValue && Number(bufferValue) > 0) {
      // Note: Proper buffer would require geometric operations
      // For now, return the original with buffer info
      log("⚠️ Buffer requested but geometric buffer not implemented", { bufferValue });
    }

    return NextResponse.json({
      ...geoJson,
      metadata: {
        source: "Marine Regions (marineregions.org)",
        regionId,
        regionName,
        bufferValue: bufferValue ? Number(bufferValue) : null,
        bufferUnit,
      }
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
