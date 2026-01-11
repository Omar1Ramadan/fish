import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [VESSELS NEAR EEZ] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [VESSELS NEAR EEZ] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [VESSELS NEAR EEZ] ❌ ${message}`, error);
};

interface VesselsNearEEZRequest {
  regionId: string;
  regionDataset?: string;
  startDate: string;
  endDate: string;
  bufferValue?: number;
  bufferUnit?: "MILES" | "NAUTICALMILES" | "KILOMETERS";
}

// Types for GFW API response (handles both snake_case and camelCase)
interface GFWVesselEntry {
  // GFW uses snake_case for vessel_id but camelCase for shipName
  vessel_id?: string;
  vesselId?: string;
  mmsi?: string;
  shipName?: string;
  ship_name?: string;
  flag?: string;
  geartype?: string;
  gear_type?: string;
  hours?: number;
  entryTimestamp?: string;
  entry_timestamp?: string;
  exitTimestamp?: string;
  exit_timestamp?: string;
  firstTransmissionDate?: string;
  lastTransmissionDate?: string;
  // Grid cell data (when not using group-by)
  lat?: number;
  lon?: number;
  date?: string;
}

export async function POST(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🚢 Fetching vessels near EEZ");

  try {
    const body: VesselsNearEEZRequest = await request.json();
    const {
      regionId,
      regionDataset = "public-eez-areas",
      startDate,
      endDate,
      bufferValue,
      bufferUnit = "NAUTICALMILES",
    } = body;

    log("📍 Request params:", {
      regionId,
      regionDataset,
      startDate,
      endDate,
      bufferValue,
      bufferUnit,
    });

    if (!regionId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required parameters: regionId, startDate, endDate" },
        { status: 400 }
      );
    }

    const apiToken = process.env.FISH_API;
    if (!apiToken) {
      logError("FISH_API token not configured!");
      return NextResponse.json(
        { error: "API token not configured" },
        { status: 500 }
      );
    }

    // Build the GFW 4wings report URL
    // Using fishing effort dataset with group-by VESSEL_ID to get individual vessels
    const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/4wings/report";
    const url = new URL(baseUrl);

    // Query parameters for vessel discovery
    url.searchParams.set("format", "JSON");
    url.searchParams.set("temporal-resolution", "ENTIRE"); // Aggregate over entire period
    url.searchParams.set("datasets[0]", "public-global-fishing-effort:latest");
    url.searchParams.set("date-range", `${startDate},${endDate}`);
    url.searchParams.set("spatial-resolution", "LOW");
    url.searchParams.set("spatial-aggregation", "true");
    url.searchParams.set("group-by", "VESSEL_ID"); // Key: group by vessel to get list

    log("🌐 GFW report URL:", url.toString());

    // Build request body with region
    // Note: GFW API accepts region.id as either string or number
    interface RequestBody {
      region: {
        dataset: string;
        id: string | number;
        bufferValue?: number;
        bufferUnit?: string;
      };
    }

    // Try to parse as number if it looks like one, otherwise keep as string
    const regionIdValue = /^\d+$/.test(regionId) ? parseInt(regionId, 10) : regionId;

    const requestBody: RequestBody = {
      region: {
        dataset: regionDataset,
        id: regionIdValue,
      },
    };

    // Add buffer if specified (to include vessels just outside EEZ)
    if (bufferValue !== undefined && bufferValue > 0) {
      requestBody.region.bufferValue = bufferValue;
      requestBody.region.bufferUnit = bufferUnit;
    }

    log("📤 Fetching vessels from GFW API with body:", JSON.stringify(requestBody, null, 2));
    const fetchStart = Date.now();

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const fetchDuration = Date.now() - fetchStart;
    log("📥 GFW API response received", {
      status: response.status,
      statusText: response.statusText,
      durationMs: fetchDuration,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError("GFW API returned error", {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 1000),
      });
      return NextResponse.json(
        { error: "Failed to fetch vessels from GFW", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    log("📊 Raw GFW response:", {
      total: data.total,
      entriesLength: data.entries?.length,
      entryKeys: data.entries?.[0] ? Object.keys(data.entries[0]) : [],
    });

    // Transform the response to a cleaner vessel list format
    const vessels: Array<{
      vesselId: string;
      mmsi: string;
      name: string;
      flag: string;
      gearType: string;
      fishingHours: number;
      entryTimestamp?: string;
      exitTimestamp?: string;
    }> = [];

    // Extract vessels from the nested response structure
    if (data.entries && data.entries.length > 0) {
      const datasetKey = Object.keys(data.entries[0]).find(k => 
        k.includes("fishing-effort")
      );
      
      log("🔑 Dataset key found:", datasetKey);
      
      if (datasetKey) {
        const vesselData = data.entries[0][datasetKey] || [];
        
        log("📋 Vessel data sample:", vesselData[0]);
        
        for (const entry of vesselData) {
          // GFW API uses snake_case for some fields
          vessels.push({
            vesselId: entry.vessel_id || entry.vesselId || "",
            mmsi: entry.mmsi || "",
            name: entry.shipName || entry.ship_name || "Unknown",
            flag: entry.flag || "UNK",
            gearType: entry.geartype || entry.gear_type || "unknown",
            fishingHours: entry.hours || 0,
            entryTimestamp: entry.entryTimestamp || entry.entry_timestamp,
            exitTimestamp: entry.exitTimestamp || entry.exit_timestamp,
          });
        }
      }
    } else {
      log("⚠️ No entries in response or empty entries array");
    }

    // Sort by fishing hours (most active first)
    vessels.sort((a, b) => b.fishingHours - a.fishingHours);

    log("✅ Vessels fetched successfully", {
      total: vessels.length,
      topVessel: vessels[0]?.name,
    });

    return NextResponse.json({
      total: vessels.length,
      vessels,
      region: {
        id: regionId,
        dataset: regionDataset,
      },
      dateRange: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    logError("Exception while fetching vessels:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint for easier testing/caching
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const regionId = searchParams.get("region-id");
  const regionDataset = searchParams.get("region-dataset") || "public-eez-areas";
  const startDate = searchParams.get("start-date");
  const endDate = searchParams.get("end-date");
  const bufferValue = searchParams.get("buffer-value");
  const bufferUnit = (searchParams.get("buffer-unit") || "NAUTICALMILES") as 
    "MILES" | "NAUTICALMILES" | "KILOMETERS";

  if (!regionId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "Missing required parameters: region-id, start-date, end-date" },
      { status: 400 }
    );
  }

  // Create a mock request body and call POST handler logic
  const body: VesselsNearEEZRequest = {
    regionId,
    regionDataset,
    startDate,
    endDate,
    bufferValue: bufferValue ? parseInt(bufferValue) : undefined,
    bufferUnit,
  };

  // Reuse POST logic by creating internal request
  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    return NextResponse.json(
      { error: "API token not configured" },
      { status: 500 }
    );
  }

  const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/4wings/report";
  const url = new URL(baseUrl);

  url.searchParams.set("format", "JSON");
  url.searchParams.set("temporal-resolution", "ENTIRE");
  url.searchParams.set("datasets[0]", "public-global-fishing-effort:latest");
  url.searchParams.set("date-range", `${startDate},${endDate}`);
  url.searchParams.set("spatial-resolution", "LOW");
  url.searchParams.set("spatial-aggregation", "true");
  url.searchParams.set("group-by", "VESSEL_ID");
  url.searchParams.set("region-id", regionId);
  url.searchParams.set("region-dataset", regionDataset);

  if (body.bufferValue && body.bufferValue > 0) {
    url.searchParams.set("buffer-value", body.bufferValue.toString());
    url.searchParams.set("buffer-unit", bufferUnit);
  }

  log("🌐 GFW report URL (GET):", url.toString());

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch vessels from GFW", details: errorText },
        { status: response.status }
      );
    }

    const data: GFWReportResponse = await response.json();

    // Transform response
    const vessels: Array<{
      vesselId: string;
      mmsi: string;
      name: string;
      flag: string;
      gearType: string;
      fishingHours: number;
    }> = [];

    if (data.entries && data.entries.length > 0) {
      const datasetKey = Object.keys(data.entries[0]).find(k => 
        k.includes("fishing-effort")
      );
      
      if (datasetKey) {
        const vesselData = data.entries[0][datasetKey] || [];
        
        for (const entry of vesselData) {
          vessels.push({
            vesselId: entry.vesselId,
            mmsi: entry.mmsi || "",
            name: entry.shipName || "Unknown",
            flag: entry.flag || "UNK",
            gearType: entry.geartype || "unknown",
            fishingHours: entry.hours || 0,
          });
        }
      }
    }

    vessels.sort((a, b) => b.fishingHours - a.fishingHours);

    return NextResponse.json({
      total: vessels.length,
      vessels,
      region: {
        id: regionId,
        dataset: regionDataset,
      },
      dateRange: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    logError("Exception while fetching vessels (GET):", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
