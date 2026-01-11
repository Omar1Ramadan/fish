import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [EEZ TILES API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [EEZ TILES API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [EEZ TILES API] ❌ ${message}`, error);
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const regionId = searchParams.get("region-id");
  const regionDataset = searchParams.get("region-dataset") || "public-eez-areas";
  const format = searchParams.get("format") || "MVT";
  const bufferValue = searchParams.get("buffer-value");
  const bufferUnit = searchParams.get("buffer-unit") || "NAUTICALMILES";

  // Log every 10th tile to reduce noise
  const shouldLog = Math.random() < 0.1;

  if (shouldLog) {
    log("🔵 EEZ tile request", { z, x, y, regionId, regionDataset });
  }

  if (!z || !x || !y || !regionId) {
    logError("Missing required parameters", { z, x, y, regionId });
    return new NextResponse("Missing parameters", { status: 400 });
  }

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    logError("FISH_API token not configured!");
    return new NextResponse("API token not configured", { status: 500 });
  }

  // Build the GFW region tile URL
  const baseUrl = `https://gateway.api.globalfishingwatch.org/v3/4wings/tile/region/${z}/${x}/${y}`;
  const url = new URL(baseUrl);
  
  url.searchParams.set("format", format);
  url.searchParams.set("region-dataset", regionDataset);
  url.searchParams.set("region-id", regionId);
  
  if (bufferValue) {
    url.searchParams.set("buffer-value", bufferValue);
    url.searchParams.set("buffer-unit", bufferUnit);
  }

  const fullUrl = url.toString();

  if (shouldLog) {
    log("🌐 Fetching", { url: fullUrl.substring(0, 150) + "..." });
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
      return new NextResponse("Failed to fetch tile", { status: response.status });
    }

    const contentType = response.headers.get("content-type");
    const arrayBuffer = await response.arrayBuffer();

    if (shouldLog) {
      log("✅ Tile OK", {
        tile: `${z}/${x}/${y}`,
        size: arrayBuffer.byteLength,
        contentType,
      });
    }

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType || "application/x-protobuf",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    if (shouldLog) {
      logError("Fetch exception", { tile: `${z}/${x}/${y}`, error });
    }
    return new NextResponse("Internal server error", { status: 500 });
  }
}
