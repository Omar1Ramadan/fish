import { NextRequest, NextResponse } from "next/server";

// Simple list of 7 key EEZ regions for monitoring
// MRGID from Marine Regions (marineregions.org)
const EEZ_REGIONS = [
  { id: "8403", name: "Ecuador (Galapagos)", country: "Ecuador", dataset: "public-eez-areas" },
  { id: "8456", name: "Peru", country: "Peru", dataset: "public-eez-areas" },
  { id: "8448", name: "Chile", country: "Chile", dataset: "public-eez-areas" },
  { id: "8446", name: "Argentina", country: "Argentina", dataset: "public-eez-areas" },
  { id: "8390", name: "Guinea", country: "Guinea", dataset: "public-eez-areas" },
  { id: "8476", name: "Australia", country: "Australia", dataset: "public-eez-areas" },
  { id: "8492", name: "Japan", country: "Japan", dataset: "public-eez-areas" },
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
