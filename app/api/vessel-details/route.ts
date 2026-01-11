import { NextRequest, NextResponse } from "next/server";

/**
 * Fetch vessel details from GFW Vessels API
 * Returns name, flag, gear type, etc. for given vessel IDs
 */

const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [VESSEL-DETAILS] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] [VESSEL-DETAILS] ${message}`);
  }
};

interface VesselInfo {
  id: string;
  name?: string;
  flag?: string;
  gearType?: string;
  vesselType?: string;
  mmsi?: string;
  imo?: string;
  callsign?: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const vesselIds = searchParams.get("ids"); // Comma-separated vessel IDs

  if (!vesselIds) {
    return NextResponse.json({ error: "ids parameter required" }, { status: 400 });
  }

  const apiToken = process.env.FISH_API;
  if (!apiToken) {
    return NextResponse.json({ error: "API token not configured" }, { status: 500 });
  }

  const ids = vesselIds.split(",").slice(0, 10); // Limit to 10 vessels
  log("🔍 Fetching vessel details", { count: ids.length, ids: ids.slice(0, 3) });

  const vessels: VesselInfo[] = [];

  // Fetch each vessel's details
  for (const id of ids) {
    try {
      // GFW Vessels API - search by ID
      const searchUrl = `https://gateway.api.globalfishingwatch.org/v3/vessels/${encodeURIComponent(id)}?datasets[0]=public-global-vessel-identity:latest&includes[0]=MATCH_CRITERIA&includes[1]=OWNERSHIP&includes[2]=AUTHORIZATIONS`;

      const response = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Extract vessel info from response
        // GFW returns nested structure with registryInfo, combinedSourcesInfo, etc.
        const registryInfo = data.registryInfo?.[0] || {};
        const combinedInfo = data.combinedSourcesInfo?.[0] || {};
        const selfReported = data.selfReportedInfo?.[0] || {};
        
        const vessel: VesselInfo = {
          id,
          name: registryInfo.shipname || combinedInfo.shipname || selfReported.shipname || data.shipname,
          flag: registryInfo.flag || combinedInfo.flag || selfReported.flag || data.flag,
          gearType: registryInfo.geartype || combinedInfo.geartype || selfReported.geartype || data.geartype,
          vesselType: registryInfo.vesselType || combinedInfo.vesselType || selfReported.vesselType || data.vesselType,
          mmsi: registryInfo.ssvid || combinedInfo.ssvid || data.ssvid,
          imo: registryInfo.imo || combinedInfo.imo || data.imo,
          callsign: registryInfo.callsign || combinedInfo.callsign || data.callsign,
        };

        // If name is still missing, try alternate fields
        if (!vessel.name) {
          vessel.name = data.shipname || `Vessel ${id.substring(0, 8)}`;
        }

        vessels.push(vessel);
        log("✅ Got vessel", { id: id.substring(0, 16), name: vessel.name, flag: vessel.flag });
      } else {
        // Vessel not found or error - add placeholder
        log("⚠️ Vessel not found", { id: id.substring(0, 16), status: response.status });
        vessels.push({
          id,
          name: `Unknown (${id.substring(0, 8)})`,
        });
      }
    } catch (error) {
      log("❌ Error fetching vessel", { id: id.substring(0, 16), error });
      vessels.push({
        id,
        name: `Error (${id.substring(0, 8)})`,
      });
    }
  }

  return NextResponse.json({ vessels });
}
