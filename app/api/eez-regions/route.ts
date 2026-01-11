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
const COMMON_EEZ_REGIONS = [
  { id: "555635930", name: "Galapagos Marine Reserve", country: "Ecuador", dataset: "public-mpa-all" },
  { id: "555745302", name: "Dorsal de Nasca MPA", country: "Peru", dataset: "public-mpa-all" },
  { id: "5690", name: "Russian EEZ", country: "Russia", dataset: "public-eez-areas" },
  { id: "8465", name: "Chile EEZ", country: "Chile", dataset: "public-eez-areas" },
  { id: "8492", name: "Indonesia EEZ", country: "Indonesia", dataset: "public-eez-areas" },
  { id: "555745303", name: "Cocos Island", country: "Costa Rica", dataset: "public-mpa-all" },
  { id: "555745304", name: "Malpelo MPA", country: "Colombia", dataset: "public-mpa-all" },
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
