import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [LOOKUP REGIONS] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [LOOKUP REGIONS] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [LOOKUP REGIONS] ❌ ${message}`, error);
};

// This endpoint queries GFW's context layers to find region IDs
// Useful for finding the correct EEZ or MPA IDs
export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🔍 Looking up regions from GFW");

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const dataset = searchParams.get("dataset") || "public-eez-areas";
  const limit = parseInt(searchParams.get("limit") || "20");

  log("📍 Search params:", { search, dataset, limit });

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    logError("FISH_API token not configured!");
    return NextResponse.json(
      { error: "API token not configured" },
      { status: 500 }
    );
  }

  try {
    // GFW has a context-layers endpoint that lists regions
    // We can also try the datasets endpoint
    const baseUrl = `https://gateway.api.globalfishingwatch.org/v3/datasets/${dataset}`;
    
    log("🌐 Fetching from:", baseUrl);

    const response = await fetch(baseUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError("GFW API error:", { status: response.status, body: errorText.substring(0, 500) });
      
      // If that doesn't work, return hardcoded known regions
      return NextResponse.json({
        message: "Could not fetch from GFW API, returning known regions",
        knownRegions: {
          eezAreas: [
            { id: "5690", name: "Russia EEZ" },
            { id: "8465", name: "Chile EEZ" },
            { id: "8371", name: "Senegal EEZ" },
            { id: "8492", name: "Indonesia EEZ" },
            { id: "8486", name: "China EEZ" },
            { id: "8466", name: "Argentina EEZ" },
          ],
          mpaAreas: [
            { id: "555635930", name: "Galapagos Marine Reserve" },
            { id: "555745302", name: "Dorsal de Nasca MPA" },
          ],
          tips: [
            "EEZ IDs can be found at: https://globalfishingwatch.org/data-download/datasets/public-eez-areas",
            "MPA IDs can be found at: https://globalfishingwatch.org/data-download/datasets/public-mpa-all",
            "You can also use the GFW Map to find region IDs by clicking on a region",
          ],
        },
      });
    }

    const data = await response.json();
    log("✅ Got dataset info:", data);

    return NextResponse.json({
      dataset,
      data,
    });
  } catch (error) {
    logError("Exception:", error);
    return NextResponse.json(
      {
        error: "Failed to lookup regions",
        details: error instanceof Error ? error.message : "Unknown error",
        tips: [
          "Try visiting https://globalfishingwatch.org/map to find region IDs",
          "Click on an EEZ or MPA to see its ID in the URL",
        ],
      },
      { status: 500 }
    );
  }
}
