import { NextRequest, NextResponse } from "next/server";

// EEZ regions with verified MRGID values from Marine Regions
// These IDs work with both GFW API and Marine Regions WFS
const EEZ_REGIONS = [
  { id: "8403", name: "Ecuador (Galapagos)", country: "Ecuador", dataset: "public-eez-areas" },
  { id: "8454", name: "Peru", country: "Peru", dataset: "public-eez-areas" },
  { id: "8447", name: "Chile", country: "Chile", dataset: "public-eez-areas" },
  { id: "8466", name: "Argentina", country: "Argentina", dataset: "public-eez-areas" },
  { id: "8373", name: "Guinea", country: "Guinea", dataset: "public-eez-areas" },
  { id: "8492", name: "Australia", country: "Australia", dataset: "public-eez-areas" },
  { id: "8488", name: "Japan", country: "Japan", dataset: "public-eez-areas" },
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search")?.toLowerCase();

  let regions = EEZ_REGIONS;

  if (search) {
    regions = regions.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.country.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({
    total: regions.length,
    regions: regions,
  });
}
