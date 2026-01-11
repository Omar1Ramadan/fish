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
// Region IDs from Marine Regions (MRGID) - used by GFW
// Find more at: https://www.marineregions.org/eezdetails.php
const COMMON_EEZ_REGIONS = [
  // Ecuador / Galapagos - MRGID 8403 (the user found this!)
  {
    id: "8403",
    name: "Ecuador EEZ (Galapagos)",
    country: "Ecuador",
    dataset: "public-eez-areas",
  },
  {
    id: "555635930",
    name: "Galapagos Marine Reserve (MPA)",
    country: "Ecuador",
    dataset: "public-mpa-all",
  },
  // South America Pacific coast
  {
    id: "8465",
    name: "Chile EEZ", 
    country: "Chile",
    dataset: "public-eez-areas",
  },
  {
    id: "8461",
    name: "Peru EEZ",
    country: "Peru",
    dataset: "public-eez-areas",
  },
  {
    id: "8448",
    name: "Argentina EEZ",
    country: "Argentina",
    dataset: "public-eez-areas",
  },
  // Other verified regions
  {
    id: "5690",
    name: "Russia EEZ",
    country: "Russia",
    dataset: "public-eez-areas",
  },
  {
    id: "8371",
    name: "Senegal EEZ",
    country: "Senegal",
    dataset: "public-eez-areas",
  },
  {
    id: "8492",
    name: "Indonesia EEZ",
    country: "Indonesia",
    dataset: "public-eez-areas",
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
