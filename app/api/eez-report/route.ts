import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [EEZ REPORT API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [EEZ REPORT API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [EEZ REPORT API] ❌ ${message}`, error);
};

interface EEZReportRequest {
  regionId: string;
  regionDataset?: string;
  startDate: string;
  endDate: string;
  dataset?: string;
  format?: "JSON" | "CSV";
  temporalResolution?: "HOURLY" | "DAILY" | "MONTHLY" | "YEARLY" | "ENTIRE";
  groupBy?: "VESSEL_ID" | "FLAG" | "GEARTYPE" | "FLAGANDGEARTYPE" | "MMSI" | "VESSEL_TYPE";
  spatialAggregation?: boolean;
  spatialResolution?: "LOW" | "HIGH";
  filters?: string[];
  bufferValue?: number;
  bufferUnit?: "MILES" | "NAUTICALMILES" | "KILOMETERS" | "RADIANS" | "DEGREES";
  bufferOperation?: "DIFFERENCE" | "DISSOLVE";
}

export async function POST(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("📊 Incoming EEZ report request");

  try {
    const body: EEZReportRequest = await request.json();
    const {
      regionId,
      regionDataset = "public-eez-areas",
      startDate,
      endDate,
      dataset = "public-global-presence:latest",
      format = "JSON",
      temporalResolution = "DAILY",
      groupBy,
      spatialAggregation = true,
      spatialResolution = "LOW",
      filters = [],
      bufferValue,
      bufferUnit,
      bufferOperation,
    } = body;

    log("📍 Request params:", {
      regionId,
      regionDataset,
      startDate,
      endDate,
      dataset,
      format,
      temporalResolution,
      groupBy,
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
    const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/4wings/report";
    const url = new URL(baseUrl);

    // Add query parameters
    url.searchParams.set("format", format);
    url.searchParams.set("temporal-resolution", temporalResolution);
    url.searchParams.set("datasets[0]", dataset);
    url.searchParams.set("date-range", `${startDate},${endDate}`);
    
    if (spatialResolution) {
      url.searchParams.set("spatial-resolution", spatialResolution);
    }
    
    if (spatialAggregation !== undefined) {
      url.searchParams.set("spatial-aggregation", spatialAggregation.toString());
    }
    
    if (groupBy) {
      url.searchParams.set("group-by", groupBy);
    }

    // Add filters
    filters.forEach((filter, index) => {
      url.searchParams.set(`filters[${index}]`, filter);
    });

    // Add buffer parameters if provided
    if (bufferValue !== undefined) {
      url.searchParams.set("buffer-value", bufferValue.toString());
      if (bufferUnit) {
        url.searchParams.set("buffer-unit", bufferUnit);
      }
      if (bufferOperation) {
        url.searchParams.set("buffer-operation", bufferOperation);
      }
    }

    log("🌐 GFW report URL:", url.toString());

    // Build request body
    interface RequestBody {
      region: {
        dataset: string;
        id: string;
        bufferValue?: number;
        bufferUnit?: string;
        bufferOperation?: string;
      };
    }
    
    const requestBody: RequestBody = {
      region: {
        dataset: regionDataset,
        id: regionId,
      },
    };

    if (bufferValue !== undefined) {
      requestBody.region.bufferValue = bufferValue;
      if (bufferUnit) {
        requestBody.region.bufferUnit = bufferUnit;
      }
      if (bufferOperation) {
        requestBody.region.bufferOperation = bufferOperation;
      }
    }

    log("📤 Fetching report from GFW API...");
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
        { error: "Failed to fetch report from GFW", details: errorText },
        { status: response.status }
      );
    }

    // Handle different response types
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/zip") || contentType?.includes("application/x-zip-compressed")) {
      // CSV format returns a ZIP file
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="eez-report-${regionId}.zip"`,
        },
      });
    } else {
      // JSON format
      const data = await response.json();
      log("✅ Report fetched successfully", {
        total: data.total,
        entriesCount: data.entries?.length,
      });
      return NextResponse.json(data);
    }
  } catch (error) {
    logError("Exception while fetching report:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("📊 Incoming EEZ report GET request");

  const searchParams = request.nextUrl.searchParams;
  const regionId = searchParams.get("region-id");
  const regionDataset = searchParams.get("region-dataset") || "public-eez-areas";
  const startDate = searchParams.get("start-date");
  const endDate = searchParams.get("end-date");
  const dataset = searchParams.get("dataset") || "public-global-presence:latest";
  const format = (searchParams.get("format") || "JSON") as "JSON" | "CSV";
  const temporalResolution = (searchParams.get("temporal-resolution") || "DAILY") as
    | "HOURLY"
    | "DAILY"
    | "MONTHLY"
    | "YEARLY"
    | "ENTIRE";
  const groupBy = searchParams.get("group-by") as
    | "VESSEL_ID"
    | "FLAG"
    | "GEARTYPE"
    | "FLAGANDGEARTYPE"
    | "MMSI"
    | "VESSEL_TYPE"
    | null;
  const spatialAggregation = searchParams.get("spatial-aggregation") !== "false";
  const spatialResolution = (searchParams.get("spatial-resolution") || "LOW") as "LOW" | "HIGH";
  const bufferValue = searchParams.get("buffer-value");
  const bufferUnit = searchParams.get("buffer-unit") as
    | "MILES"
    | "NAUTICALMILES"
    | "KILOMETERS"
    | "RADIANS"
    | "DEGREES"
    | null;
  const bufferOperation = searchParams.get("buffer-operation") as
    | "DIFFERENCE"
    | "DISSOLVE"
    | null;

  if (!regionId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "Missing required parameters: region-id, start-date, end-date" },
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
  const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/4wings/report";
  const url = new URL(baseUrl);

  // Add query parameters
  url.searchParams.set("format", format);
  url.searchParams.set("temporal-resolution", temporalResolution);
  url.searchParams.set("datasets[0]", dataset);
  url.searchParams.set("date-range", `${startDate},${endDate}`);
  url.searchParams.set("region-id", regionId);
  url.searchParams.set("region-dataset", regionDataset);
  url.searchParams.set("spatial-resolution", spatialResolution);
  url.searchParams.set("spatial-aggregation", spatialAggregation.toString());

  if (groupBy) {
    url.searchParams.set("group-by", groupBy);
  }

  if (bufferValue) {
    url.searchParams.set("buffer-value", bufferValue);
    if (bufferUnit) {
      url.searchParams.set("buffer-unit", bufferUnit);
    }
    if (bufferOperation) {
      url.searchParams.set("buffer-operation", bufferOperation);
    }
  }

  log("🌐 GFW report URL (GET):", url.toString());

  try {
    log("📤 Fetching report from GFW API (GET)...");
    const fetchStart = Date.now();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
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
        { error: "Failed to fetch report from GFW", details: errorText },
        { status: response.status }
      );
    }

    // Handle different response types
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/zip") || contentType?.includes("application/x-zip-compressed")) {
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="eez-report-${regionId}.zip"`,
        },
      });
    } else {
      const data = await response.json();
      log("✅ Report fetched successfully", {
        total: data.total,
        entriesCount: data.entries?.length,
      });
      return NextResponse.json(data);
    }
  } catch (error) {
    logError("Exception while fetching report:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
