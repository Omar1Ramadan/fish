import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [SAR TILES API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [SAR TILES API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [SAR TILES API] ❌ ${message}`, error);
};

// 1x1 fully transparent PNG for fallback
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

// Check if buffer looks like a valid PNG
function isPNG(buffer: ArrayBuffer): boolean {
  const arr = new Uint8Array(buffer);
  return (
    arr[0] === 137 &&
    arr[1] === 80 &&
    arr[2] === 78 &&
    arr[3] === 71 &&
    arr[4] === 13 &&
    arr[5] === 10 &&
    arr[6] === 26 &&
    arr[7] === 10
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const startDate = searchParams.get("start") || "2024-01-01";
  const endDate = searchParams.get("end") || "2024-03-31";
  const style = searchParams.get("style"); // Base64 encoded style from sar-style API
  const interval = searchParams.get("interval") || "DAY";
  const matched = searchParams.get("matched"); // "true", "false", or null for all

  // Log every 10th tile to reduce noise
  const shouldLog = Math.random() < 0.1;

  if (shouldLog) {
    log("🛰️ SAR tile request", { z, x, y, matched, hasStyle: !!style });
  }

  if (!z || !x || !y) {
    logError("Missing tile coordinates", { z, x, y });
    return new NextResponse(TRANSPARENT_PNG, {
      headers: { "Content-Type": "image/png" },
    });
  }

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    logError("FISH_API token not configured!");
    return new NextResponse(TRANSPARENT_PNG, {
      headers: { "Content-Type": "image/png" },
    });
  }

  // Build the GFW 4wings tile URL for SAR vessel detections
  const baseUrl = `https://gateway.api.globalfishingwatch.org/v3/4wings/tile/heatmap/${z}/${x}/${y}`;

  // Build query string
  const queryParts: string[] = [];
  queryParts.push(`format=PNG`);
  queryParts.push(`interval=${interval}`);
  queryParts.push(`datasets[0]=public-global-sar-presence:latest`);
  queryParts.push(`date-range=${startDate},${endDate}`);

  // Add style if provided (from sar-style API)
  if (style) {
    queryParts.push(`style=${encodeURIComponent(style)}`);
  }

  // Build filters
  const filters: string[] = [];
  
  // Add AIS matching filter if specified
  if (matched === "true") {
    filters.push("matched='true'");
  } else if (matched === "false") {
    filters.push("matched='false'");
  }

  // Add filters to query
  filters.forEach((filter, index) => {
    queryParts.push(`filters[${index}]=${encodeURIComponent(filter)}`);
  });

  const fullUrl = `${baseUrl}?${queryParts.join("&")}`;

  if (shouldLog) {
    log("🌐 Fetching SAR tiles", { url: fullUrl.substring(0, 150) + "..." });
  }

  try {
    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      if (shouldLog) {
        const errorText = await response.text();
        logError(`GFW error ${response.status}`, {
          tile: `${z}/${x}/${y}`,
          error: errorText.substring(0, 200),
        });
      }
      return new NextResponse(TRANSPARENT_PNG, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("image")) {
      if (shouldLog) {
        logError("Non-image response", { contentType, tile: `${z}/${x}/${y}` });
      }
      return new NextResponse(TRANSPARENT_PNG, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    const imageBuffer = await response.arrayBuffer();

    if (!isPNG(imageBuffer)) {
      if (shouldLog) {
        logError("Invalid PNG data", {
          tile: `${z}/${x}/${y}`,
          firstBytes: Array.from(new Uint8Array(imageBuffer.slice(0, 8))),
        });
      }
      return new NextResponse(TRANSPARENT_PNG, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    if (shouldLog) {
      log("✅ SAR tile OK", {
        tile: `${z}/${x}/${y}`,
        size: imageBuffer.byteLength,
      });
    }

    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    if (shouldLog) {
      logError("Fetch exception", { tile: `${z}/${x}/${y}`, error });
    }
    return new NextResponse(TRANSPARENT_PNG, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=60",
      },
    });
  }
}
