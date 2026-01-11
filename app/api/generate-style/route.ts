import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [STYLE API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [STYLE API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [STYLE API] ❌ ${message}`, error);
};

interface StyleResponse {
  colorRamp: {
    stepsByZoom: Record<string, Array<{ color: string; value: number }>>;
  };
  url: string;
}

// Cache for styles (in-memory, for demo purposes)
const styleCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🎨 Incoming style generation request");

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get("start") || "2024-01-01";
  const endDate = searchParams.get("end") || "2024-03-31";
  const color = searchParams.get("color") || "%2303fcbe"; // Bright cyan/turquoise for visibility
  const interval = searchParams.get("interval") || "DAY";

  log("📍 Request params:", { startDate, endDate, color, interval });

  // Check cache
  const cacheKey = `${startDate}-${endDate}-${color}-${interval}`;
  const cached = styleCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log("✅ Returning cached style");
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

  // Build the generate-png URL
  // POST https://gateway.api.globalfishingwatch.org/v3/4wings/generate-png
  const gfwUrl = new URL(
    "https://gateway.api.globalfishingwatch.org/v3/4wings/generate-png"
  );
  gfwUrl.searchParams.set("interval", interval);
  gfwUrl.searchParams.set("date-range", `${startDate},${endDate}`);
  gfwUrl.searchParams.set("color", decodeURIComponent(color));

  // Build URL with datasets[0] manually to avoid bracket encoding
  const fullUrl = `${gfwUrl.toString()}&datasets[0]=public-global-fishing-effort:latest`;

  log("🌐 GFW generate-png URL:", fullUrl);

  try {
    log("📤 Fetching style from GFW API...");
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
        { error: "Failed to generate style from GFW", details: errorText },
        { status: response.status }
      );
    }

    const data: StyleResponse = await response.json();
    log("✅ Style generated successfully", {
      hasColorRamp: !!data.colorRamp,
      urlLength: data.url?.length,
    });

    // Log the full URL for debugging
    log("🔗 Full tile URL from GFW:", data.url);

    // Decode and log the style for debugging
    try {
      const urlObj = new URL(data.url);
      const styleParam = urlObj.searchParams.get("style");
      if (styleParam) {
        const decodedStyle = JSON.parse(
          Buffer.from(styleParam, "base64").toString("utf-8")
        );
        log("🎨 Decoded style:", decodedStyle);
      }
    } catch (e) {
      log("⚠️ Could not decode style:", e);
    }

    // Log the color ramp for debugging
    if (data.colorRamp?.stepsByZoom) {
      log(
        "🎨 Color ramp (first 3 steps):",
        JSON.stringify(data.colorRamp.stepsByZoom["0"]?.slice(0, 3))
      );
    }

    // Cache the result
    styleCache.set(cacheKey, { url: data.url, timestamp: Date.now() });

    // The URL from GFW is a template with {z}/{x}/{y} placeholders
    // We need to convert it to work with our proxy
    // Original: https://gateway.api.globalfishingwatch.org/v3/4wings/tile/heatmap/{z}/{x}/{y}?...
    // We'll return the full URL and the frontend can use it directly or through our proxy

    return NextResponse.json({
      tileUrl: data.url,
      colorRamp: data.colorRamp,
      cached: false,
    });
  } catch (error) {
    logError("Exception while generating style:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
