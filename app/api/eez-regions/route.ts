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

// EEZ Region with MRGID from Marine Regions (marineregions.org)
// Reference: https://www.marineregions.org/eezsearch.php
interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
  group: string; // Geographic grouping
}

const EEZ_REGIONS: EEZRegion[] = [
  // ═══════════════════════════════════════════════════════════
  // SOUTH AMERICA - Pacific Coast (Major IUU Fishing Areas)
  // ═══════════════════════════════════════════════════════════
  { id: "8403", name: "Ecuador", country: "Ecuador", dataset: "public-eez-areas", group: "South America" },
  { id: "8466", name: "Galapagos", country: "Ecuador", dataset: "public-eez-areas", group: "South America" },
  { id: "8456", name: "Peru", country: "Peru", dataset: "public-eez-areas", group: "South America" },
  { id: "8448", name: "Chile", country: "Chile", dataset: "public-eez-areas", group: "South America" },
  { id: "8464", name: "Easter Island", country: "Chile", dataset: "public-eez-areas", group: "South America" },
  { id: "8449", name: "Colombia (Pacific)", country: "Colombia", dataset: "public-eez-areas", group: "South America" },
  
  // South America - Atlantic Coast
  { id: "8446", name: "Argentina", country: "Argentina", dataset: "public-eez-areas", group: "South America" },
  { id: "8447", name: "Brazil", country: "Brazil", dataset: "public-eez-areas", group: "South America" },
  { id: "8462", name: "Uruguay", country: "Uruguay", dataset: "public-eez-areas", group: "South America" },
  { id: "8467", name: "Falkland Islands", country: "United Kingdom", dataset: "public-eez-areas", group: "South America" },
  
  // ═══════════════════════════════════════════════════════════
  // CENTRAL AMERICA & CARIBBEAN
  // ═══════════════════════════════════════════════════════════
  { id: "8455", name: "Panama", country: "Panama", dataset: "public-eez-areas", group: "Central America" },
  { id: "8450", name: "Costa Rica", country: "Costa Rica", dataset: "public-eez-areas", group: "Central America" },
  { id: "8454", name: "Nicaragua", country: "Nicaragua", dataset: "public-eez-areas", group: "Central America" },
  { id: "8452", name: "Honduras", country: "Honduras", dataset: "public-eez-areas", group: "Central America" },
  { id: "8451", name: "El Salvador", country: "El Salvador", dataset: "public-eez-areas", group: "Central America" },
  { id: "8453", name: "Guatemala", country: "Guatemala", dataset: "public-eez-areas", group: "Central America" },
  { id: "8457", name: "Mexico (Pacific)", country: "Mexico", dataset: "public-eez-areas", group: "Central America" },
  { id: "8458", name: "Mexico (Gulf)", country: "Mexico", dataset: "public-eez-areas", group: "Central America" },
  
  // ═══════════════════════════════════════════════════════════
  // NORTH AMERICA
  // ═══════════════════════════════════════════════════════════
  { id: "8456", name: "United States (Pacific)", country: "United States", dataset: "public-eez-areas", group: "North America" },
  { id: "8459", name: "United States (Atlantic)", country: "United States", dataset: "public-eez-areas", group: "North America" },
  { id: "8461", name: "United States (Gulf of Mexico)", country: "United States", dataset: "public-eez-areas", group: "North America" },
  { id: "8479", name: "Alaska", country: "United States", dataset: "public-eez-areas", group: "North America" },
  { id: "8493", name: "Hawaii", country: "United States", dataset: "public-eez-areas", group: "North America" },
  { id: "8478", name: "Canada (Pacific)", country: "Canada", dataset: "public-eez-areas", group: "North America" },
  { id: "8477", name: "Canada (Atlantic)", country: "Canada", dataset: "public-eez-areas", group: "North America" },
  
  // ═══════════════════════════════════════════════════════════
  // EAST ASIA (Major Fishing Fleets)
  // ═══════════════════════════════════════════════════════════
  { id: "8485", name: "China", country: "China", dataset: "public-eez-areas", group: "East Asia" },
  { id: "8492", name: "Japan", country: "Japan", dataset: "public-eez-areas", group: "East Asia" },
  { id: "8502", name: "South Korea", country: "South Korea", dataset: "public-eez-areas", group: "East Asia" },
  { id: "8503", name: "North Korea", country: "North Korea", dataset: "public-eez-areas", group: "East Asia" },
  { id: "8510", name: "Taiwan", country: "Taiwan", dataset: "public-eez-areas", group: "East Asia" },
  
  // ═══════════════════════════════════════════════════════════
  // SOUTHEAST ASIA
  // ═══════════════════════════════════════════════════════════
  { id: "8500", name: "Philippines", country: "Philippines", dataset: "public-eez-areas", group: "Southeast Asia" },
  { id: "8512", name: "Vietnam", country: "Vietnam", dataset: "public-eez-areas", group: "Southeast Asia" },
  { id: "8511", name: "Thailand", country: "Thailand", dataset: "public-eez-areas", group: "Southeast Asia" },
  { id: "8490", name: "Indonesia", country: "Indonesia", dataset: "public-eez-areas", group: "Southeast Asia" },
  { id: "8496", name: "Malaysia", country: "Malaysia", dataset: "public-eez-areas", group: "Southeast Asia" },
  { id: "8483", name: "Cambodia", country: "Cambodia", dataset: "public-eez-areas", group: "Southeast Asia" },
  { id: "8499", name: "Myanmar", country: "Myanmar", dataset: "public-eez-areas", group: "Southeast Asia" },
  { id: "8482", name: "Brunei", country: "Brunei", dataset: "public-eez-areas", group: "Southeast Asia" },
  
  // ═══════════════════════════════════════════════════════════
  // SOUTH ASIA
  // ═══════════════════════════════════════════════════════════
  { id: "8489", name: "India", country: "India", dataset: "public-eez-areas", group: "South Asia" },
  { id: "8506", name: "Sri Lanka", country: "Sri Lanka", dataset: "public-eez-areas", group: "South Asia" },
  { id: "8480", name: "Bangladesh", country: "Bangladesh", dataset: "public-eez-areas", group: "South Asia" },
  { id: "8500", name: "Pakistan", country: "Pakistan", dataset: "public-eez-areas", group: "South Asia" },
  { id: "8497", name: "Maldives", country: "Maldives", dataset: "public-eez-areas", group: "South Asia" },
  
  // ═══════════════════════════════════════════════════════════
  // OCEANIA / PACIFIC
  // ═══════════════════════════════════════════════════════════
  { id: "8476", name: "Australia", country: "Australia", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8498", name: "New Zealand", country: "New Zealand", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8501", name: "Papua New Guinea", country: "Papua New Guinea", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8487", name: "Fiji", country: "Fiji", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8504", name: "Solomon Islands", country: "Solomon Islands", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8513", name: "Vanuatu", country: "Vanuatu", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8494", name: "Kiribati", country: "Kiribati", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8509", name: "Tuvalu", country: "Tuvalu", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8484", name: "Cook Islands", country: "New Zealand", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8507", name: "Tonga", country: "Tonga", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8505", name: "Samoa", country: "Samoa", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8495", name: "Marshall Islands", country: "Marshall Islands", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8488", name: "French Polynesia", country: "France", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8500", name: "New Caledonia", country: "France", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8508", name: "Palau", country: "Palau", dataset: "public-eez-areas", group: "Oceania" },
  { id: "8486", name: "Micronesia", country: "Micronesia", dataset: "public-eez-areas", group: "Oceania" },
  
  // ═══════════════════════════════════════════════════════════
  // AFRICA - West Coast
  // ═══════════════════════════════════════════════════════════
  { id: "8395", name: "Morocco", country: "Morocco", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8415", name: "Mauritania", country: "Mauritania", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8430", name: "Senegal", country: "Senegal", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8388", name: "Gambia", country: "Gambia", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8391", name: "Guinea-Bissau", country: "Guinea-Bissau", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8390", name: "Guinea", country: "Guinea", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8431", name: "Sierra Leone", country: "Sierra Leone", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8411", name: "Liberia", country: "Liberia", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8401", name: "Ivory Coast", country: "Ivory Coast", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8389", name: "Ghana", country: "Ghana", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8437", name: "Togo", country: "Togo", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8377", name: "Benin", country: "Benin", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8421", name: "Nigeria", country: "Nigeria", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8379", name: "Cameroon", country: "Cameroon", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8386", name: "Equatorial Guinea", country: "Equatorial Guinea", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8387", name: "Gabon", country: "Gabon", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8424", name: "Republic of Congo", country: "Republic of Congo", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8373", name: "Angola", country: "Angola", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8417", name: "Namibia", country: "Namibia", dataset: "public-eez-areas", group: "West Africa" },
  { id: "8433", name: "South Africa", country: "South Africa", dataset: "public-eez-areas", group: "West Africa" },
  
  // ═══════════════════════════════════════════════════════════
  // AFRICA - East Coast
  // ═══════════════════════════════════════════════════════════
  { id: "8416", name: "Mozambique", country: "Mozambique", dataset: "public-eez-areas", group: "East Africa" },
  { id: "8436", name: "Tanzania", country: "Tanzania", dataset: "public-eez-areas", group: "East Africa" },
  { id: "8405", name: "Kenya", country: "Kenya", dataset: "public-eez-areas", group: "East Africa" },
  { id: "8432", name: "Somalia", country: "Somalia", dataset: "public-eez-areas", group: "East Africa" },
  { id: "8413", name: "Madagascar", country: "Madagascar", dataset: "public-eez-areas", group: "East Africa" },
  { id: "8418", name: "Mauritius", country: "Mauritius", dataset: "public-eez-areas", group: "East Africa" },
  { id: "8429", name: "Seychelles", country: "Seychelles", dataset: "public-eez-areas", group: "East Africa" },
  { id: "8381", name: "Comoros", country: "Comoros", dataset: "public-eez-areas", group: "East Africa" },
  
  // ═══════════════════════════════════════════════════════════
  // EUROPE - Atlantic
  // ═══════════════════════════════════════════════════════════
  { id: "5677", name: "United Kingdom", country: "United Kingdom", dataset: "public-eez-areas", group: "Europe" },
  { id: "5669", name: "Ireland", country: "Ireland", dataset: "public-eez-areas", group: "Europe" },
  { id: "5674", name: "France (Atlantic)", country: "France", dataset: "public-eez-areas", group: "Europe" },
  { id: "5680", name: "Spain", country: "Spain", dataset: "public-eez-areas", group: "Europe" },
  { id: "5678", name: "Portugal", country: "Portugal", dataset: "public-eez-areas", group: "Europe" },
  { id: "5676", name: "Netherlands", country: "Netherlands", dataset: "public-eez-areas", group: "Europe" },
  { id: "5668", name: "Belgium", country: "Belgium", dataset: "public-eez-areas", group: "Europe" },
  { id: "5670", name: "Germany", country: "Germany", dataset: "public-eez-areas", group: "Europe" },
  { id: "5667", name: "Denmark", country: "Denmark", dataset: "public-eez-areas", group: "Europe" },
  { id: "5677", name: "Norway", country: "Norway", dataset: "public-eez-areas", group: "Europe" },
  { id: "5681", name: "Sweden", country: "Sweden", dataset: "public-eez-areas", group: "Europe" },
  { id: "5671", name: "Finland", country: "Finland", dataset: "public-eez-areas", group: "Europe" },
  { id: "5673", name: "Iceland", country: "Iceland", dataset: "public-eez-areas", group: "Europe" },
  { id: "5672", name: "Faroe Islands", country: "Denmark", dataset: "public-eez-areas", group: "Europe" },
  { id: "5679", name: "Greenland", country: "Denmark", dataset: "public-eez-areas", group: "Europe" },
  
  // ═══════════════════════════════════════════════════════════
  // EUROPE - Mediterranean
  // ═══════════════════════════════════════════════════════════
  { id: "5682", name: "Italy", country: "Italy", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5683", name: "Greece", country: "Greece", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5684", name: "Turkey", country: "Turkey", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5685", name: "Cyprus", country: "Cyprus", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5686", name: "Malta", country: "Malta", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5687", name: "Croatia", country: "Croatia", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5688", name: "Albania", country: "Albania", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5689", name: "Montenegro", country: "Montenegro", dataset: "public-eez-areas", group: "Mediterranean" },
  { id: "5690", name: "Slovenia", country: "Slovenia", dataset: "public-eez-areas", group: "Mediterranean" },
  
  // ═══════════════════════════════════════════════════════════
  // MIDDLE EAST
  // ═══════════════════════════════════════════════════════════
  { id: "8402", name: "Iran", country: "Iran", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8400", name: "Iraq", country: "Iraq", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8407", name: "Kuwait", country: "Kuwait", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8427", name: "Saudi Arabia", country: "Saudi Arabia", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8438", name: "UAE", country: "United Arab Emirates", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8423", name: "Oman", country: "Oman", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8441", name: "Yemen", country: "Yemen", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8422", name: "Qatar", country: "Qatar", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8376", name: "Bahrain", country: "Bahrain", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8398", name: "Israel", country: "Israel", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8408", name: "Lebanon", country: "Lebanon", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8435", name: "Syria", country: "Syria", dataset: "public-eez-areas", group: "Middle East" },
  { id: "8385", name: "Egypt", country: "Egypt", dataset: "public-eez-areas", group: "Middle East" },
  
  // ═══════════════════════════════════════════════════════════
  // RUSSIA
  // ═══════════════════════════════════════════════════════════
  { id: "8425", name: "Russia (Pacific)", country: "Russia", dataset: "public-eez-areas", group: "Russia" },
  { id: "8426", name: "Russia (Arctic)", country: "Russia", dataset: "public-eez-areas", group: "Russia" },
  { id: "5691", name: "Russia (Baltic)", country: "Russia", dataset: "public-eez-areas", group: "Russia" },
  { id: "8428", name: "Russia (Black Sea)", country: "Russia", dataset: "public-eez-areas", group: "Russia" },
  
  // ═══════════════════════════════════════════════════════════
  // MARINE PROTECTED AREAS (MPAs)
  // ═══════════════════════════════════════════════════════════
  { id: "555635930", name: "Galapagos Marine Reserve", country: "Ecuador", dataset: "public-mpa-all", group: "MPAs" },
  { id: "555705938", name: "Papahānaumokuākea", country: "United States", dataset: "public-mpa-all", group: "MPAs" },
  { id: "555705937", name: "Pacific Remote Islands", country: "United States", dataset: "public-mpa-all", group: "MPAs" },
  { id: "555635986", name: "Great Barrier Reef", country: "Australia", dataset: "public-mpa-all", group: "MPAs" },
  { id: "555636012", name: "Phoenix Islands", country: "Kiribati", dataset: "public-mpa-all", group: "MPAs" },
  { id: "555636052", name: "Chagos Archipelago", country: "United Kingdom", dataset: "public-mpa-all", group: "MPAs" },
];

// Get unique groups for filtering
const REGION_GROUPS = [...new Set(EEZ_REGIONS.map(r => r.group))];

export async function GET(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🌍 Incoming EEZ regions request");

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search")?.toLowerCase();
  const country = searchParams.get("country")?.toLowerCase();
  const group = searchParams.get("group");

  let regions = EEZ_REGIONS;

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

  // Filter by group
  if (group) {
    regions = regions.filter((r) => r.group === group);
  }

  log("✅ Returning regions", { count: regions.length });

  return NextResponse.json({
    total: regions.length,
    groups: REGION_GROUPS,
    regions: regions,
  });
}
