import { NextRequest, NextResponse } from "next/server";

const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [FIXED-INFRA-MVT] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [FIXED-INFRA-MVT] ${message}`);
  }
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const z = searchParams.get("z");
  const x = searchParams.get("x");
  const y = searchParams.get("y");
  const startDate = searchParams.get("start") || "2017-01-01";
  const endDate = searchParams.get("end") || new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10); // 3 months ago default
  const label = searchParams.get("label"); // optional: oil|wind|unknown

  if (!z || !x || !y) {
    return NextResponse.json({ error: "z, x, y required" }, { status: 400 });
  }

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    return NextResponse.json({ error: "API token not configured" }, { status: 500 });
  }

  // Build GFW fixed infrastructure MVT URL
  const base = `https://gateway.api.globalfishingwatch.org/v3/datasets/public-fixed-infrastructure-filtered:latest/user-context-layers/${z}/${x}/${y}`;
  const params = new URLSearchParams();
  params.set("format", "MVT");
  // date-range param is supported by many GFW endpoints
  params.set("date-range", `${startDate},${endDate}`);
  if (label) {
    params.set("label", label);
  }

  const tileUrl = `${base}?${params.toString()}`;

  log("🔷 Fixed infra MVT request", { z, x, y, url: tileUrl.substring(0, 160) + "..." });

  try {
    const response = await fetch(tileUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/x-protobuf",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        log("⚪ Empty MVT tile", { z, x, y });
        return new NextResponse(null, { status: 204 });
      }
      const errorText = await response.text();
      log("❌ GFW fixed infra MVT error", { status: response.status, error: errorText.substring(0, 200) });
      return new NextResponse(null, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    log("✅ Fixed infra MVT OK", { z, x, y, size: arrayBuffer.byteLength });

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/x-protobuf",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    log("❌ Exception fetching fixed infra MVT", error);
    return new NextResponse(null, { status: 500 });
  }
}
