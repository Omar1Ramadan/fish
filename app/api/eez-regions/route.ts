import { NextRequest, NextResponse } from "next/server";

// Simple list of 7 key EEZ regions for monitoring
// Using simple string IDs that map to Marine Regions geonames
const EEZ_REGIONS = [
  { id: "ecuador", name: "Ecuador (Galapagos)", country: "Ecuador", dataset: "public-eez-areas" },
  { id: "peru", name: "Peru", country: "Peru", dataset: "public-eez-areas" },
  { id: "chile", name: "Chile", country: "Chile", dataset: "public-eez-areas" },
  { id: "argentina", name: "Argentina", country: "Argentina", dataset: "public-eez-areas" },
  { id: "guinea", name: "Guinea", country: "Guinea", dataset: "public-eez-areas" },
  { id: "australia", name: "Australia", country: "Australia", dataset: "public-eez-areas" },
  { id: "japan", name: "Japan", country: "Japan", dataset: "public-eez-areas" },
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
