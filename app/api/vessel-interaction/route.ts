import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy the GFW 4Wings Interaction API
 * 
 * Based on GFW API docs: https://globalfishingwatch.org/our-apis/documentation
 * Endpoint: /v3/4wings/interaction/{z}/{x}/{y}/{cells}
 * 
 * Returns vessel IDs and fishing hours for specific grid cells
 */

const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [VESSEL-INTERACTION] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [VESSEL-INTERACTION] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [VESSEL-INTERACTION] ❌ ${message}`, error);
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const cells = searchParams.get("cells"); // Comma-separated cell indices
  const startDate = searchParams.get("start-date") || "2024-01-01";
  const endDate = searchParams.get("end-date") || "2024-12-31";
  const dataset = searchParams.get("dataset") || "public-global-fishing-effort:latest";

  log("🖱️ Interaction request", { z, x, y, cells, startDate, endDate });

  if (!z || !x || !y || !cells) {
    return NextResponse.json(
      { error: "z, x, y, and cells are required" },
      { status: 400 }
    );
  }

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    logError("FISH_API token not configured");
    return NextResponse.json({ error: "API token not configured" }, { status: 500 });
  }

  // Build the GFW Interaction API URL
  // Format: /v3/4wings/interaction/{z}/{x}/{y}/{cells}
  const baseUrl = `https://gateway.api.globalfishingwatch.org/v3/4wings/interaction/${z}/${x}/${y}/${cells}`;
  const params = new URLSearchParams();
  params.set("datasets[0]", dataset);
  params.set("date-range", `${startDate},${endDate}`);

  const fullUrl = `${baseUrl}?${params.toString()}`;
  log("🌐 Fetching from GFW Interaction API", { url: fullUrl });

  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError(`GFW API error ${response.status}`, errorText.substring(0, 500));
      return NextResponse.json(
        { error: `GFW API error: ${response.status}`, vessels: [], raw: errorText.substring(0, 200) },
        { status: response.status }
      );
    }

    const data = await response.json();
    log("📦 Raw API response structure", { 
      keys: Object.keys(data),
      total: data.total,
      entriesType: Array.isArray(data.entries) ? `array[${data.entries.length}]` : typeof data.entries,
      firstEntryType: data.entries?.[0] ? (Array.isArray(data.entries[0]) ? 'nested array' : typeof data.entries[0]) : 'none'
    });

    // Parse the response
    // Structure is: { entries: [[{id, hours}, ...]], total: N }
    // Each entry in outer array = one cell, inner array = vessels in that cell
    const vessels: Array<{
      id: string;
      hours: number;
      cell: string;
    }> = [];

    if (data.entries && Array.isArray(data.entries)) {
      const cellIds = cells.split(',');
      
      data.entries.forEach((cellEntries: unknown, cellIndex: number) => {
        const cellId = cellIds[cellIndex] || String(cellIndex);
        
        if (Array.isArray(cellEntries)) {
          // Nested array: [[{id, hours}, ...]]
          cellEntries.forEach((entry: { id?: string; hours?: number; value?: number }) => {
            if (entry && entry.id) {
              vessels.push({
                id: entry.id,
                hours: entry.hours ?? entry.value ?? 0,
                cell: cellId,
              });
            }
          });
        } else if (cellEntries && typeof cellEntries === 'object') {
          // Flat object: {id, hours}
          const entry = cellEntries as { id?: string; hours?: number; value?: number };
          if (entry.id) {
            vessels.push({
              id: entry.id,
              hours: entry.hours ?? entry.value ?? 0,
              cell: cellId,
            });
          }
        }
      });
    }

    // Sort by hours descending
    vessels.sort((a, b) => b.hours - a.hours);

    log("✅ Vessels parsed", { 
      count: vessels.length, 
      total: data.total,
      sample: vessels.slice(0, 2).map(v => ({ id: v.id.substring(0, 16), hours: v.hours }))
    });

    return NextResponse.json({
      vessels: vessels.slice(0, 50), // Limit to top 50
      total: data.total || vessels.length,
      cells: cells,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    logError("Exception fetching vessel data", error);
    return NextResponse.json(
      { error: "Failed to fetch vessel data", vessels: [] },
      { status: 500 }
    );
  }
}
