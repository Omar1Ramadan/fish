import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [VESSEL EVENTS] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [VESSEL EVENTS] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [VESSEL EVENTS] ❌ ${message}`, error);
};

interface FishingEvent {
  id: string;
  start: string;
  end: string;
  type: string;
  position: {
    lat: number;
    lon: number;
  };
  boundingBox?: number[];
  vessel: {
    id: string;
    name: string;
    ssvid: string;
  };
  regions?: {
    eez?: string[];
    rfmo?: string[];
    highSeas?: string[];
    mpa?: string[];
  };
  distances?: {
    startDistanceFromShoreKm: number;
    endDistanceFromShoreKm: number;
    startDistanceFromPortKm: number;
    endDistanceFromPortKm: number;
  };
  fishing?: {
    totalDistanceKm: number;
    averageSpeedKnots: number;
    averageDurationHours: number;
    potentialRisk: boolean;
  };
}

interface GFWEventsResponse {
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
  entries: FishingEvent[];
}

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🎣 Fetching fishing events for vessel");

  const searchParams = request.nextUrl.searchParams;
  const vesselId = searchParams.get("vessel-id");
  const startDate = searchParams.get("start-date");
  const endDate = searchParams.get("end-date");
  const limit = searchParams.get("limit") || "200";
  const offset = searchParams.get("offset") || "0";
  const eventType = searchParams.get("type") || "fishing"; // fishing, loitering, port_visit, encounter

  if (!vesselId) {
    return NextResponse.json(
      { error: "Missing required parameter: vessel-id" },
      { status: 400 }
    );
  }

  log("📍 Request params:", { vesselId, startDate, endDate, limit, offset, eventType });

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    logError("FISH_API token not configured!");
    return NextResponse.json(
      { error: "API token not configured" },
      { status: 500 }
    );
  }

  // Map event type to dataset
  const datasetMap: Record<string, string> = {
    fishing: "public-global-fishing-events:latest",
    loitering: "public-global-loitering-events:latest",
    port_visit: "public-global-port-visits-events:latest",
    encounter: "public-global-encounters-events:latest",
    gap: "public-global-gaps-events:latest",
  };

  const dataset = datasetMap[eventType] || datasetMap.fishing;

  // Build GFW Events API URL
  const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/events";
  const url = new URL(baseUrl);

  url.searchParams.set("datasets[0]", dataset);
  url.searchParams.set("vessels[0]", vesselId);
  url.searchParams.set("limit", limit);
  url.searchParams.set("offset", offset);
  url.searchParams.set("sort", "+start"); // Chronological order for track

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
        { error: "Failed to fetch events from GFW", details: errorText },
        { status: response.status }
      );
    }

    const data: GFWEventsResponse = await response.json();

    // Transform to track-friendly format
    const events = data.entries.map((event) => ({
      id: event.id,
      type: event.type,
      startTime: event.start,
      endTime: event.end,
      position: event.position,
      boundingBox: event.boundingBox,
      distanceKm: event.fishing?.totalDistanceKm,
      avgSpeedKnots: event.fishing?.averageSpeedKnots,
      durationHours: event.fishing?.averageDurationHours,
      distanceFromShoreKm: event.distances?.startDistanceFromShoreKm,
      distanceFromPortKm: event.distances?.startDistanceFromPortKm,
      regions: event.regions,
      potentialRisk: event.fishing?.potentialRisk,
    }));

    log("✅ Events fetched successfully", {
      total: data.total,
      returned: events.length,
    });

    // Calculate track summary
    const trackSummary = {
      totalEvents: data.total,
      totalDistanceKm: events.reduce((sum, e) => sum + (e.distanceKm || 0), 0),
      avgSpeedKnots:
        events.length > 0
          ? events.reduce((sum, e) => sum + (e.avgSpeedKnots || 0), 0) / events.length
          : 0,
      dateRange: {
        start: events[0]?.startTime,
        end: events[events.length - 1]?.endTime,
      },
    };

    return NextResponse.json({
      total: data.total,
      events,
      vesselId,
      eventType,
      trackSummary,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        nextOffset: data.nextOffset,
      },
    });
  } catch (error) {
    logError("Exception while fetching events:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// POST endpoint for fetching multiple event types at once
export async function POST(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🎣 Fetching multiple event types for vessel");

  try {
    const body = await request.json();
    const { vesselId, startDate, endDate, eventTypes = ["fishing"] } = body;

    if (!vesselId) {
      return NextResponse.json(
        { error: "Missing required parameter: vesselId" },
        { status: 400 }
      );
    }

    log("📍 Request:", { vesselId, startDate, endDate, eventTypes });

    const apiToken = process.env.FISH_API;
    if (!apiToken) {
      logError("FISH_API token not configured!");
      return NextResponse.json(
        { error: "API token not configured" },
        { status: 500 }
      );
    }

    const datasetMap: Record<string, string> = {
      fishing: "public-global-fishing-events:latest",
      loitering: "public-global-loitering-events:latest",
      port_visit: "public-global-port-visits-events:latest",
      encounter: "public-global-encounters-events:latest",
      gap: "public-global-gaps-events:latest",
    };

    const allEvents: Array<{
      id: string;
      type: string;
      startTime: string;
      endTime: string;
      position: { lat: number; lon: number };
      distanceKm?: number;
      avgSpeedKnots?: number;
    }> = [];

    // Fetch each event type
    for (const eventType of eventTypes) {
      const dataset = datasetMap[eventType];
      if (!dataset) continue;

      const baseUrl = "https://gateway.api.globalfishingwatch.org/v3/events";
      const url = new URL(baseUrl);

      url.searchParams.set("datasets[0]", dataset);
      url.searchParams.set("vessels[0]", vesselId);
      url.searchParams.set("limit", "100");
      url.searchParams.set("offset", "0");
      url.searchParams.set("sort", "+start");

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
          for (const event of data.entries) {
            allEvents.push({
              id: event.id,
              type: event.type,
              startTime: event.start,
              endTime: event.end,
              position: event.position,
              distanceKm: event.fishing?.totalDistanceKm,
              avgSpeedKnots: event.fishing?.averageSpeedKnots,
            });
          }
        }
      } catch (err) {
        log(`⚠️ Failed to fetch ${eventType} events:`, err);
      }
    }

    // Sort all events chronologically
    allEvents.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    log("✅ All events fetched", {
      totalEvents: allEvents.length,
      byType: eventTypes.map((t) => ({
        type: t,
        count: allEvents.filter((e) => e.type === t).length,
      })),
    });

    return NextResponse.json({
      total: allEvents.length,
      events: allEvents,
      vesselId,
      eventTypes,
    });
  } catch (error) {
    logError("Exception in POST:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
