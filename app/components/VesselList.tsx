"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
}

export interface Vessel {
  vesselId: string;
  mmsi: string;
  name: string;
  flag: string;
  gearType: string;
  fishingHours: number;
  hasGaps?: boolean;
  gapCount?: number;
  totalGapHours?: number;
}

interface GapCheckResult {
  hasGaps: boolean;
  gapCount: number;
  totalGapHours?: number;
}

interface VesselListProps {
  selectedEEZ: EEZRegion | null;
  startDate: string;
  endDate: string;
  bufferValue?: number;
  onVesselSelect?: (vessel: Vessel | null) => void;
  selectedVessel?: Vessel | null;
  hasPredictionActive?: boolean; // Show indicator when prediction is displayed for selected vessel
}

// Country flag emoji helper
const getFlagEmoji = (countryCode: string): string => {
  if (!countryCode || countryCode === "UNK" || countryCode.length !== 3) {
    return "🏴";
  }
  // Convert ISO 3166-1 alpha-3 to alpha-2 for flag emoji
  const alpha3ToAlpha2: Record<string, string> = {
    CHN: "CN",
    TWN: "TW",
    JPN: "JP",
    KOR: "KR",
    ESP: "ES",
    USA: "US",
    RUS: "RU",
    PRT: "PT",
    FRA: "FR",
    GBR: "GB",
    NOR: "NO",
    ISL: "IS",
    CHL: "CL",
    PER: "PE",
    ARG: "AR",
    ECU: "EC",
    MEX: "MX",
    PAN: "PA",
    VNM: "VN",
    THA: "TH",
    IDN: "ID",
    PHL: "PH",
    MYS: "MY",
    IND: "IN",
    NZL: "NZ",
    AUS: "AU",
    ZAF: "ZA",
    BRA: "BR",
    CAN: "CA",
    URY: "UY",
    VUT: "VU",
    KIR: "KI",
    FSM: "FM",
    MHL: "MH",
    PLW: "PW",
    TUV: "TV",
    SLB: "SB",
    PNG: "PG",
    FJI: "FJ",
    WSM: "WS",
    TON: "TO",
    COK: "CK",
    NIU: "NU",
    TKL: "TK",
    ASM: "AS",
    GUM: "GU",
    MNP: "MP",
    UMI: "UM",
  };
  const alpha2 = alpha3ToAlpha2[countryCode.toUpperCase()];
  if (!alpha2) return "🏴";

  const codePoints = alpha2
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Gear type display names
const gearTypeNames: Record<string, string> = {
  trawlers: "Trawler",
  purse_seines: "Purse Seine",
  tuna_purse_seines: "Tuna Purse Seine",
  other_purse_seines: "Other Purse Seine",
  drifting_longlines: "Drifting Longline",
  set_longlines: "Set Longline",
  squid_jigger: "Squid Jigger",
  pole_and_line: "Pole & Line",
  trollers: "Troller",
  fixed_gear: "Fixed Gear",
  pots_and_traps: "Pots & Traps",
  set_gillnets: "Set Gillnet",
  driftnets: "Driftnet",
  fishing: "Fishing",
  unknown: "Unknown",
};

export default function VesselList({
  selectedEEZ,
  startDate,
  endDate,
  bufferValue = 0,
  onVesselSelect,
  selectedVessel,
  hasPredictionActive = false,
}: VesselListProps) {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCheckingGaps, setIsCheckingGaps] = useState(false);
  const [gapCheckProgress, setGapCheckProgress] = useState(0);
  const [showOnlyWithGaps, setShowOnlyWithGaps] = useState(false);
  const [gapChecks, setGapChecks] = useState<Record<string, GapCheckResult>>(
    {}
  );

  // Fetch vessels when EEZ or date range changes
  const fetchVessels = useCallback(async () => {
    if (!selectedEEZ) {
      setVessels([]);
      return;
    }

    console.log("[VesselList] 🚢 Fetching vessels for:", {
      regionId: selectedEEZ.id,
      regionName: selectedEEZ.name,
      dataset: selectedEEZ.dataset,
      startDate,
      endDate,
      bufferValue,
    });

    setIsLoading(true);
    setError(null);

    try {
      const requestBody = {
        regionId: selectedEEZ.id,
        regionDataset: selectedEEZ.dataset,
        startDate,
        endDate,
        bufferValue: bufferValue > 0 ? bufferValue : undefined,
        bufferUnit: "NAUTICALMILES",
      };

      console.log("[VesselList] 📤 Request body:", requestBody);

      const response = await fetch("/api/vessels-near-eez", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("[VesselList] 📥 Response status:", response.status);

      if (!response.ok) {
        let errorMessage = "Failed to fetch vessels";
        try {
          const errorData = await response.json();
          console.error("[VesselList] ❌ Error response:", errorData);
          errorMessage = errorData.error || errorMessage;
        } catch {
          console.error("[VesselList] ❌ Error status:", response.status);
        }
        // Don't throw on rate limit or temporary errors - just log
        if (response.status === 429 || response.status >= 500) {
          console.warn("[VesselList] ⚠️ Temporary error, will retry on next change");
          setIsLoading(false);
          return;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log("[VesselList] ✅ Received data:", {
        total: data.total,
        vesselCount: data.vessels?.length,
        firstVessel: data.vessels?.[0],
      });

      setVessels(data.vessels || []);
    } catch (err) {
      console.error("[VesselList] ❌ Exception:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch vessels");
      setVessels([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEEZ, startDate, endDate, bufferValue]);

  // Debounce timer ref
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch on mount and when dependencies change (debounced)
  useEffect(() => {
    // Clear any pending fetch
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Reset gap checks immediately when dates change
    setGapChecks({});
    setShowOnlyWithGaps(false);

    // Debounce the fetch to avoid rapid-fire requests when dragging slider
    fetchTimeoutRef.current = setTimeout(() => {
      fetchVessels();
    }, 500); // Wait 500ms after last change before fetching

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [fetchVessels]);

  // Check vessels for AIS gaps (with optional limit)
  const checkForGaps = useCallback(
    async (limit?: number) => {
      if (vessels.length === 0) return;

      const vesselsToScan = limit ? vessels.slice(0, limit) : vessels;
      console.log(
        "[VesselList] 🔍 Starting AIS gap check for",
        vesselsToScan.length,
        "vessels"
      );
      setIsCheckingGaps(true);
      setGapCheckProgress(0);

      const newGapChecks: Record<string, GapCheckResult> = { ...gapChecks }; // Keep existing results
      const batchSize = 5; // Check 5 vessels at a time to avoid rate limits
      const totalBatches = Math.ceil(vesselsToScan.length / batchSize);

      for (let i = 0; i < vesselsToScan.length; i += batchSize) {
        const batch = vesselsToScan.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        console.log(
          `[VesselList] 📡 Checking batch ${batchNum}/${totalBatches}`
        );

        // Check each vessel in parallel within the batch
        const batchPromises = batch.map(async (vessel) => {
          try {
            const url = `/api/vessel-gaps?vessel-id=${encodeURIComponent(
              vessel.vesselId
            )}&start-date=${startDate}&end-date=${endDate}&limit=100`;

            const response = await fetch(url);
            if (!response.ok) {
              console.warn(
                `[VesselList] ⚠️ Gap check failed for ${vessel.name}`
              );
              return {
                vesselId: vessel.vesselId,
                result: { hasGaps: false, gapCount: 0 },
              };
            }

            const data = await response.json();
            const totalGapHours =
              data.gaps?.reduce(
                (sum: number, gap: { durationHours?: number }) =>
                  sum + (gap.durationHours || 0),
                0
              ) || 0;

            return {
              vesselId: vessel.vesselId,
              result: {
                hasGaps: data.total > 0,
                gapCount: data.total || 0,
                totalGapHours,
              },
            };
          } catch (err) {
            console.error(
              `[VesselList] ❌ Gap check error for ${vessel.name}:`,
              err
            );
            return {
              vesselId: vessel.vesselId,
              result: { hasGaps: false, gapCount: 0 },
            };
          }
        });

        const results = await Promise.all(batchPromises);
        results.forEach(({ vesselId, result }) => {
          newGapChecks[vesselId] = result;
        });

        setGapCheckProgress(
          Math.round(((i + batch.length) / vesselsToScan.length) * 100)
        );

        // Small delay between batches to be nice to the API
        if (i + batchSize < vesselsToScan.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      console.log("[VesselList] ✅ Gap check complete!", {
        scanned: vesselsToScan.length,
        total: vessels.length,
        withGaps: Object.values(newGapChecks).filter((r) => r.hasGaps).length,
      });

      setGapChecks(newGapChecks);
      setIsCheckingGaps(false);
    },
    [vessels, startDate, endDate, gapChecks]
  );

  // Merge gap check results into vessels and filter
  const vesselsWithGaps = vessels.map((v) => ({
    ...v,
    hasGaps: gapChecks[v.vesselId]?.hasGaps || false,
    gapCount: gapChecks[v.vesselId]?.gapCount || 0,
    totalGapHours: gapChecks[v.vesselId]?.totalGapHours || 0,
  }));

  // Sort: vessels with gaps first, then by gap count
  const sortedVessels = [...vesselsWithGaps].sort((a, b) => {
    if (a.hasGaps && !b.hasGaps) return -1;
    if (!a.hasGaps && b.hasGaps) return 1;
    if (a.gapCount !== b.gapCount) return (b.gapCount || 0) - (a.gapCount || 0);
    return b.fishingHours - a.fishingHours;
  });

  // Filter if needed
  const filteredVessels = showOnlyWithGaps
    ? sortedVessels.filter((v) => v.hasGaps)
    : sortedVessels;

  // Stats
  const vesselsWithGapsCount = vesselsWithGaps.filter((v) => v.hasGaps).length;
  const hasGapCheckData = Object.keys(gapChecks).length > 0;

  // Handle vessel click
  const handleVesselClick = (vessel: Vessel) => {
    if (selectedVessel?.vesselId === vessel.vesselId) {
      // Deselect if clicking same vessel
      onVesselSelect?.(null);
    } else {
      onVesselSelect?.(vessel);
    }
  };

  // Format fishing hours
  const formatHours = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  if (!selectedEEZ) {
    return null;
  }

  return (
    <div className="bg-slate-950/95 backdrop-blur-md border border-cyan-900/30 rounded-lg shadow-2xl shadow-cyan-950/20 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-2 h-2 bg-cyan-400 rounded-full" />
            {isLoading && (
              <div className="absolute inset-0 w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
            )}
          </div>
          <span className="font-mono text-sm font-semibold text-white">
            VESSELS
          </span>
          {vessels.length > 0 && (
            <span className="font-mono text-xs text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded">
              {vessels.length}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-slate-800">
          {/* Gap check controls */}
          {!isLoading && vessels.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-800/50 bg-slate-900/30">
              {!isCheckingGaps && !hasGapCheckData && (
                <div className="space-y-2">
                  <button
                    onClick={() => checkForGaps(30)}
                    className="w-full py-2 px-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-lg transition-colors"
                  >
                    <span className="font-mono text-xs text-slate-300">
                      Quick Scan (Top 30)
                    </span>
                  </button>
                  {vessels.length > 30 && (
                    <button
                      onClick={() => checkForGaps()}
                      className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] font-mono text-slate-400 transition-colors"
                    >
                      Full Scan ({vessels.length} vessels) - slower
                    </button>
                  )}
                </div>
              )}

              {isCheckingGaps && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-400">
                      Checking vessels...
                    </span>
                    <span className="font-mono text-xs text-slate-300">
                      {gapCheckProgress}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-500 transition-all duration-300"
                      style={{ width: `${gapCheckProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {hasGapCheckData && !isCheckingGaps && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-300">
                      {vesselsWithGapsCount} vessel
                      {vesselsWithGapsCount !== 1 ? "s" : ""} with AIS gaps
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      {Object.keys(gapChecks).length}/{vessels.length} scanned
                    </span>
                  </div>

                  {/* Scan more button if not all scanned */}
                  {Object.keys(gapChecks).length < vessels.length && (
                    <button
                      onClick={() => checkForGaps()}
                      className="w-full py-1.5 px-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded text-[10px] font-mono text-slate-300 transition-colors"
                    >
                      Scan Remaining{" "}
                      {vessels.length - Object.keys(gapChecks).length} Vessels
                    </button>
                  )}

                  {vesselsWithGapsCount > 0 && (
                    <button
                      onClick={() => setShowOnlyWithGaps(!showOnlyWithGaps)}
                      className={`w-full py-1.5 px-3 rounded text-xs font-mono transition-colors ${
                        showOnlyWithGaps
                          ? "bg-slate-600/50 text-slate-200 border border-slate-500/50"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {showOnlyWithGaps
                        ? "Show All Vessels"
                        : "Show Only Dark Vessels"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="px-4 py-8 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span className="font-mono text-xs text-slate-500">
                Scanning vessels...
              </span>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="px-4 py-4">
              <div className="bg-red-950/50 border border-red-900/50 rounded px-3 py-2">
                <p className="font-mono text-xs text-red-400">{error}</p>
                <button
                  onClick={fetchVessels}
                  className="mt-2 font-mono text-xs text-red-300 hover:text-red-200 underline"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && vessels.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="font-mono text-xs text-slate-500">
                No vessels detected in this region
              </p>
              <p className="font-mono text-[10px] text-slate-600 mt-1">
                Try expanding the date range or buffer zone
              </p>
            </div>
          )}

          {/* Vessel list */}
          {!isLoading && !error && filteredVessels.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              {filteredVessels.map((vessel) => (
                <button
                  key={vessel.vesselId}
                  onClick={() => handleVesselClick(vessel)}
                  className={`w-full px-4 py-3 flex items-center gap-3 border-b border-slate-800/50 last:border-b-0 transition-colors text-left ${
                    selectedVessel?.vesselId === vessel.vesselId
                      ? "bg-slate-800/60 border-l-2 border-l-slate-400"
                      : "hover:bg-slate-900/50"
                  }`}
                >
                  {/* Flag */}
                  <span className="text-lg" title={vessel.flag}>
                    {getFlagEmoji(vessel.flag)}
                  </span>

                  {/* Vessel info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm text-white truncate">
                        {vessel.name}
                      </p>
                      {/* Prediction active indicator */}
                      {selectedVessel?.vesselId === vessel.vesselId && hasPredictionActive && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-600/30 border border-slate-500/30 rounded text-[9px] font-mono text-slate-300">
                          Active
                        </span>
                      )}
                      {/* Gap indicator */}
                      {vessel.hasGaps && !(selectedVessel?.vesselId === vessel.vesselId && hasPredictionActive) && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-700/50 border border-slate-600/50 rounded text-[9px] font-mono text-slate-400"
                          title={`${vessel.gapCount} AIS gap${
                            vessel.gapCount !== 1 ? "s" : ""
                          } (${Math.round(vessel.totalGapHours || 0)}h dark)`}
                        >
                          {vessel.gapCount} gaps
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] text-slate-500">
                        {gearTypeNames[vessel.gearType] || vessel.gearType}
                      </span>
                      {vessel.mmsi && (
                        <>
                          <span className="text-slate-700">•</span>
                          <span className="font-mono text-[10px] text-slate-600">
                            {vessel.mmsi}
                          </span>
                        </>
                      )}
                      {vessel.hasGaps &&
                        vessel.totalGapHours &&
                        vessel.totalGapHours > 0 && (
                          <>
                            <span className="text-slate-700">•</span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {Math.round(vessel.totalGapHours)}h dark
                            </span>
                          </>
                        )}
                    </div>
                  </div>

                  {/* Fishing hours */}
                  <div className="text-right">
                    <p className="font-mono text-sm text-cyan-400">
                      {formatHours(vessel.fishingHours)}
                    </p>
                    <p className="font-mono text-[10px] text-slate-600">
                      fishing
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty after filter */}
          {!isLoading &&
            !error &&
            vessels.length > 0 &&
            filteredVessels.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="font-mono text-xs text-slate-500">
                  No vessels with AIS gaps detected
                </p>
                <button
                  onClick={() => setShowOnlyWithGaps(false)}
                  className="font-mono text-xs text-cyan-400 hover:text-cyan-300 mt-2"
                >
                  Show all vessels
                </button>
              </div>
            )}

          {/* Footer stats */}
          {!isLoading && vessels.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/30 space-y-1">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-slate-600">
                  Total fishing hours
                </span>
                <span className="font-mono text-[10px] text-cyan-400">
                  {Math.round(
                    vessels.reduce((sum, v) => sum + v.fishingHours, 0)
                  ).toLocaleString()}
                  h
                </span>
              </div>
              {hasGapCheckData && (
                <div className="flex justify-between">
                  <span className="font-mono text-[10px] text-slate-600">
                    Total dark hours
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {Math.round(
                      vesselsWithGaps.reduce(
                        (sum, v) => sum + (v.totalGapHours || 0),
                        0
                      )
                    ).toLocaleString()}
                    h
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
