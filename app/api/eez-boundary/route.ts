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

// Map GFW region IDs to Marine Regions data
// Marine Regions is the authoritative source used by GFW for EEZ boundaries
// See: https://www.marineregions.org/
// For EEZs, we can use MRGID directly. For MPAs, we use name search.
const REGION_INFO: Record<string, { name: string; mrgid?: number; isMPA?: boolean }> = {
  // EEZs - use MRGID for direct lookup
  "8403": { name: "Ecuador", mrgid: 8403 }, // Ecuador EEZ (includes Galapagos waters)
  "5690": { name: "Russia", mrgid: 5690 },
  "8465": { name: "Chile", mrgid: 8465 },
  "8461": { name: "Peru", mrgid: 8461 },
  "8448": { name: "Argentina", mrgid: 8448 },
  "8492": { name: "Indonesia", mrgid: 8492 },
  "8371": { name: "Senegal", mrgid: 8371 },
  // MPAs - use name search (different layer)
  "555635930": { name: "Galapagos", isMPA: true },
  "555745302": { name: "Nasca", isMPA: true },
  "555745303": { name: "Cocos", isMPA: true },
  "555745304": { name: "Malpelo", isMPA: true },
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
    // Map GFW region ID to Marine Regions info
    const regionInfo = REGION_INFO[regionId];
    
    if (!regionInfo) {
      log("⚠️ No Marine Regions mapping for region ID", { regionId });
      return NextResponse.json(
        { 
          error: "Region not found in mapping",
          regionId,
          note: "This region ID is not yet mapped to Marine Regions"
        },
        { status: 404 }
      );
    }

    log("🌍 Fetching boundary from Marine Regions", { regionId, regionInfo });

    // Fetch from Marine Regions WFS
    // Using GetFeature request to get EEZ boundaries
    const wfsUrl = new URL(MARINE_REGIONS_WFS);
    wfsUrl.searchParams.set("service", "WFS");
    wfsUrl.searchParams.set("version", "1.1.0");
    wfsUrl.searchParams.set("request", "GetFeature");
    wfsUrl.searchParams.set("outputFormat", "application/json");
    
    // Use MRGID for direct lookup (more reliable) or name search for MPAs
    if (regionInfo.mrgid) {
      // Direct MRGID lookup for EEZs
      wfsUrl.searchParams.set("typeName", "MarineRegions:eez");
      wfsUrl.searchParams.set("CQL_FILTER", `mrgid=${regionInfo.mrgid}`);
    } else if (regionInfo.isMPA) {
      // Name search for MPAs (different layer)
      wfsUrl.searchParams.set("typeName", "MarineRegions:eez");
      wfsUrl.searchParams.set("CQL_FILTER", `geoname LIKE '%${regionInfo.name}%'`);
    } else {
      // Fallback to name search
      wfsUrl.searchParams.set("typeName", "MarineRegions:eez");
      wfsUrl.searchParams.set("CQL_FILTER", `geoname LIKE '%${regionInfo.name}%'`);
    }

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
        regionName: regionInfo.name,
        mrgid: regionInfo.mrgid,
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
