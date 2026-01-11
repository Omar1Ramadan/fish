import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [TILES API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [TILES API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [TILES API] ❌ ${message}`, error);
};

// 1x1 fully transparent PNG for fallback (verified transparent)
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

// Check if buffer looks like a valid PNG (starts with PNG magic bytes)
function isPNG(buffer: ArrayBuffer): boolean {
  const arr = new Uint8Array(buffer);
  // PNG magic bytes: 137 80 78 71 13 10 26 10
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
  const style = searchParams.get("style");
  const interval = searchParams.get("interval") || "DAY";

  // Log every 10th tile to reduce noise
  const shouldLog = Math.random() < 0.1;

  if (shouldLog) {
    log("🔵 Tile request", { z, x, y, hasStyle: !!style });
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

  // Build the GFW 4wings tile URL
  // Note: generate-png returns prod-v2 URLs but they're not accessible, so use the main gateway
  // The style parameter should still work as it's just JSON data
  const baseUrl = `https://gateway.api.globalfishingwatch.org/v3/4wings/tile/heatmap/${z}/${x}/${y}`;

  // Build query string - ORDER MATTERS for some APIs
  // Match exactly what GFW returns in the generate-png URL
  const queryParts: string[] = [];
  queryParts.push(`format=PNG`);
  queryParts.push(`interval=${interval}`);
  queryParts.push(`datasets[0]=public-global-fishing-effort:latest`);
  queryParts.push(`date-range=${startDate},${endDate}`);

  // Add the style parameter if provided
  // CRITICAL: The style must be passed correctly for proper visualization
  if (style && style.length > 0) {
    // The style is base64 encoded JSON - must be URL-encoded for the request
    queryParts.push(`style=${encodeURIComponent(style)}`);
    if (shouldLog) {
      log("🎨 Using style", {
        length: style.length,
        preview: style.substring(0, 40),
        encoded: encodeURIComponent(style).substring(0, 40),
      });
    }
  } else {
    if (shouldLog) {
      log("⚠️ NO STYLE - tiles may render with default/wrong colors!");
    }
  }

  const fullUrl = `${baseUrl}?${queryParts.join("&")}`;

  if (shouldLog) {
    log("🌐 Fetching", { url: fullUrl.substring(0, 120) + "..." });
  }

  try {
    const response = await fetch(fullUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    // Always return transparent for any non-success
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

    // Check content type
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

    // Validate it's actually a PNG
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
      log("✅ Tile OK", {
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
