import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [EEZ REGIONS API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [EEZ REGIONS API] ${message}`);
  }
};

// Common EEZ regions with their IDs (from GFW reference data)
// These are well-known EEZ IDs that users might want to monitor
// Region IDs - MRGID from Marine Regions (marineregions.org)
// Only including verified working regions
// To find IDs: Go to marineregions.org, search for EEZ, look at URL for MRGID
const COMMON_EEZ_REGIONS = [
  // Ecuador / Galapagos - VERIFIED WORKING
  {
    id: "8403",
    name: "Ecuador EEZ (Galapagos)",
    country: "Ecuador",
    dataset: "public-eez-areas",
  },
  // Galapagos MPA - VERIFIED WORKING
  {
    id: "555635930",
    name: "Galapagos Marine Reserve (MPA)",
    country: "Ecuador",
    dataset: "public-mpa-all",
  },
];

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🌍 Incoming EEZ regions request");

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search")?.toLowerCase();
  const country = searchParams.get("country")?.toLowerCase();

  let regions = COMMON_EEZ_REGIONS;

  // Filter by search term
  if (search) {
    regions = regions.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.country.toLowerCase().includes(search)
    );
  }

  // Filter by country
  if (country) {
    regions = regions.filter((r) => r.country.toLowerCase() === country);
  }

  log("✅ Returning regions", { count: regions.length });

  return NextResponse.json({
    total: regions.length,
    regions: regions,
  });
}
