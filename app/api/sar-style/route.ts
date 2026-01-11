import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [SAR STYLE API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [SAR STYLE API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [SAR STYLE API] ❌ ${message}`, error);
};

interface StyleResponse {
  colorRamp: {
    stepsByZoom: Record<string, Array<{ color: string; value: number }>>;
  };
  url: string;
}

// Cache for styles
const styleCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🛰️ Incoming SAR style generation request");

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("start") || "2024-01-01";
  const endDate = searchParams.get("end") || "2024-03-31";
  // Purple/magenta color for SAR detections (similar to GFW)
  const color = searchParams.get("color") || "#9945FF";
  const interval = searchParams.get("interval") || "DAY";
  
  // SAR-specific filters
  const matched = searchParams.get("matched"); // "true", "false", or null for all
  const neuralVesselType = searchParams.get("neuralVesselType"); // fishing likelihood threshold

  log("📍 Request params:", { startDate, endDate, color, interval, matched, neuralVesselType });

  // Check cache
  const cacheKey = `sar-${startDate}-${endDate}-${color}-${interval}-${matched}-${neuralVesselType}`;
  const cached = styleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log("✅ Returning cached SAR style");
    return NextResponse.json({
      tileUrl: cached.url,
      cached: true,
    });
  }

  const apiToken = process.env.FISH_API;
  log("🔑 Checking FISH_API token...", {
    exists: !!apiToken,
    length: apiToken?.length,
  });

  if (!apiToken) {
    logError("FISH_API token not configured in environment!");
    return NextResponse.json(
      { error: "API token not configured" },
      { status: 500 }
    );
  }

  // Build the generate-png URL for SAR dataset
  const gfwUrl = new URL(
    "https://gateway.api.globalfishingwatch.org/v3/4wings/generate-png"
  );
  gfwUrl.searchParams.set("interval", interval);
  gfwUrl.searchParams.set("date-range", `${startDate},${endDate}`);
  gfwUrl.searchParams.set("color", color);

  // Build URL with SAR dataset
  let fullUrl = `${gfwUrl.toString()}&datasets[0]=public-global-sar-presence:latest`;

  // Build filters array
  const filters: string[] = [];

  // Add matched filter if specified
  if (matched === "true") {
    filters.push("matched='true'");
  } else if (matched === "false") {
    filters.push("matched='false'");
  }

  // Add neural vessel type filter if specified
  // Values: >= 0.9 = "Likely fishing", <= 0.1 = "Likely non-fishing"
  if (neuralVesselType) {
    const threshold = parseFloat(neuralVesselType);
    if (!isNaN(threshold)) {
      if (threshold >= 0.9) {
        filters.push("neural_vessel_type >= 0.9");
      } else if (threshold <= 0.1) {
        filters.push("neural_vessel_type <= 0.1");
      }
    }
  }

  // Add filters to URL
  filters.forEach((filter, index) => {
    fullUrl += `&filters[${index}]=${encodeURIComponent(filter)}`;
  });

  log("🌐 GFW generate-png URL:", fullUrl);

  try {
    log("📤 Fetching SAR style from GFW API...");
    const fetchStart = Date.now();

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
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
        { error: "Failed to generate SAR style from GFW", details: errorText },
        { status: response.status }
      );
    }

    const data: StyleResponse = await response.json();
    log("✅ SAR style generated successfully", {
      hasColorRamp: !!data.colorRamp,
      urlLength: data.url?.length,
    });

    // Log the full URL for debugging
    log("🔗 Full SAR tile URL from GFW:", data.url);

    // Decode and log the style for debugging
    try {
      const urlObj = new URL(data.url);
      const styleParam = urlObj.searchParams.get("style");
      if (styleParam) {
        const decodedStyle = JSON.parse(
          Buffer.from(styleParam, "base64").toString("utf-8")
        );
        log("🎨 Decoded SAR style:", decodedStyle);
      }
    } catch (e) {
      log("⚠️ Could not decode style:", e);
    }

    // Cache the result
    styleCache.set(cacheKey, { url: data.url, timestamp: Date.now() });

    return NextResponse.json({
      tileUrl: data.url,
      colorRamp: data.colorRamp,
      cached: false,
    });
  } catch (error) {
    logError("Exception while generating SAR style:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
