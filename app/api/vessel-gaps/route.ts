import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [VESSEL GAPS] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [VESSEL GAPS] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [VESSEL GAPS] ❌ ${message}`, error);
};

interface GapEvent {
  id: string;
  start: string;
  end: string;
  type: string;
  position: {
    lat: number;
    lon: number;
  };
  vessel: {
    id: string;
    name: string;
    ssvid: string;
  };
  regions?: {
    eez?: string[];
    rfmo?: string[];
    highSeas?: string[];
  };
  distances?: {
    startDistanceFromShoreKm: number;
    endDistanceFromShoreKm: number;
  };
  gap?: {
    intentionalDisabling?: boolean;
    distanceKm?: number;
    durationHours?: number;
  };
}

interface GFWEventsResponse {
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
  entries: GapEvent[];
}

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🔍 Fetching AIS gaps for vessel");

  const searchParams = request.nextUrl.searchParams;
  const vesselId = searchParams.get("vessel-id");
  const startDate = searchParams.get("start-date");
  const endDate = searchParams.get("end-date");
  const limit = searchParams.get("limit") || "100";
  const offset = searchParams.get("offset") || "0";

  if (!vesselId) {
    return NextResponse.json(
      { error: "Missing required parameter: vessel-id" },
      { status: 400 }
    );
  }

  log("📍 Request params:", { vesselId, startDate, endDate, limit, offset });

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    logError("FISH_API token not configured!");
    return NextResponse.json(
      { error: "API token not configured" },
      { status: 500 }
    );
  }

  // Build GFW Events API URL for gaps
  const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/events";
  const url = new URL(baseUrl);

  url.searchParams.set("datasets[0]", "public-global-gaps-events:latest");
  url.searchParams.set("vessels[0]", vesselId);
  url.searchParams.set("limit", limit);
  url.searchParams.set("offset", offset);
  url.searchParams.set("sort", "-start"); // Most recent first

  if (startDate) {
    url.searchParams.set("start-date", startDate);
  }
  if (endDate) {
    url.searchParams.set("end-date", endDate);
  }

  log("🌐 GFW Events API URL:", url.toString());

  try {
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
      durationMs: fetchDuration,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError("GFW API returned error", {
        status: response.status,
        body: errorText.substring(0, 500),
      });
      return NextResponse.json(
        { error: "Failed to fetch gaps from GFW", details: errorText },
        { status: response.status }
      );
    }

    const data: GFWEventsResponse = await response.json();

    // Transform to cleaner format
    const gaps = data.entries.map((event) => ({
      id: event.id,
      startTime: event.start,
      endTime: event.end,
      position: event.position,
      durationHours: event.gap?.durationHours,
      distanceKm: event.gap?.distanceKm,
      intentionalDisabling: event.gap?.intentionalDisabling,
      regions: event.regions,
      distanceFromShore: {
        start: event.distances?.startDistanceFromShoreKm,
        end: event.distances?.endDistanceFromShoreKm,
      },
    }));

    log("✅ Gaps fetched successfully", {
      total: data.total,
      returned: gaps.length,
    });

    return NextResponse.json({
      total: data.total,
      gaps,
      vesselId,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        nextOffset: data.nextOffset,
      },
    });
  } catch (error) {
    logError("Exception while fetching gaps:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST endpoint for batch vessel gap checking
export async function POST(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🔍 Batch checking AIS gaps for vessels");

  try {
    const body = await request.json();
    const { vesselIds, startDate, endDate } = body;

    if (!vesselIds || !Array.isArray(vesselIds) || vesselIds.length === 0) {
      return NextResponse.json(
        { error: "Missing required parameter: vesselIds (array)" },
        { status: 400 }
      );
    }

    log("📍 Batch request:", {
      vesselCount: vesselIds.length,
      startDate,
      endDate,
    });

    const apiToken = process.env.FISH_API;
    if (!apiToken) {
      logError("FISH_API token not configured!");
      return NextResponse.json(
        { error: "API token not configured" },
        { status: 500 }
      );
    }

    // Check gaps for each vessel (limit to first 10 to avoid rate limits)
    const vesselsToCheck = vesselIds.slice(0, 10);
    const results: Record<string, { hasGaps: boolean; gapCount: number }> = {};

    for (const vesselId of vesselsToCheck) {
      const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/events";
      const url = new URL(baseUrl);

      url.searchParams.set("datasets[0]", "public-global-gaps-events:latest");
      url.searchParams.set("vessels[0]", vesselId);
      url.searchParams.set("limit", "1"); // Just need to know if any exist

      if (startDate) {
        url.searchParams.set("start-date", startDate);
      }
      if (endDate) {
        url.searchParams.set("end-date", endDate);
      }

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiToken}`,
          },
        });

        if (response.ok) {
          const data: GFWEventsResponse = await response.json();
          results[vesselId] = {
            hasGaps: data.total > 0,
            gapCount: data.total,
          };
        } else {
          results[vesselId] = { hasGaps: false, gapCount: 0 };
        }
      } catch {
        results[vesselId] = { hasGaps: false, gapCount: 0 };
      }
    }

    log("✅ Batch gap check complete", {
      checked: Object.keys(results).length,
      withGaps: Object.values(results).filter((r) => r.hasGaps).length,
    });

    return NextResponse.json({
      results,
      checked: Object.keys(results).length,
      total: vesselIds.length,
    });
  } catch (error) {
    logError("Exception in batch gap check:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
