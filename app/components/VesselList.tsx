"use client";

import { useState, useEffect, useCallback } from "react";

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
}

interface Vessel {
  vesselId: string;
  mmsi: string;
  name: string;
  flag: string;
  gearType: string;
  fishingHours: number;
  hasGaps?: boolean; // Will be populated later
}

interface VesselListProps {
  selectedEEZ: EEZRegion | null;
  startDate: string;
  endDate: string;
  bufferValue?: number;
  onVesselSelect?: (vessel: Vessel | null) => void;
  selectedVessel?: Vessel | null;
}

// Country flag emoji helper
const getFlagEmoji = (countryCode: string): string => {
  if (!countryCode || countryCode === "UNK" || countryCode.length !== 3) {
    return "🏴";
  }
  // Convert ISO 3166-1 alpha-3 to alpha-2 for flag emoji
  const alpha3ToAlpha2: Record<string, string> = {
    CHN: "CN", TWN: "TW", JPN: "JP", KOR: "KR", ESP: "ES", USA: "US",
    RUS: "RU", PRT: "PT", FRA: "FR", GBR: "GB", NOR: "NO", ISL: "IS",
    CHL: "CL", PER: "PE", ARG: "AR", ECU: "EC", MEX: "MX", PAN: "PA",
    VNM: "VN", THA: "TH", IDN: "ID", PHL: "PH", MYS: "MY", IND: "IN",
    NZL: "NZ", AUS: "AU", ZAF: "ZA", BRA: "BR", CAN: "CA", URY: "UY",
    VUT: "VU", KIR: "KI", FSM: "FM", MHL: "MH", PLW: "PW", TUV: "TV",
    SLB: "SB", PNG: "PG", FJI: "FJ", WSM: "WS", TON: "TO", COK: "CK",
    NIU: "NU", TKL: "TK", ASM: "AS", GUM: "GU", MNP: "MP", UMI: "UM",
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
}: VesselListProps) {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

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
        const errorData = await response.json();
        console.error("[VesselList] ❌ Error response:", errorData);
        throw new Error(errorData.error || "Failed to fetch vessels");
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

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchVessels();
  }, [fetchVessels]);

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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-slate-800">
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
          {!isLoading && !error && vessels.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              {vessels.map((vessel) => (
                <button
                  key={vessel.vesselId}
                  onClick={() => handleVesselClick(vessel)}
                  className={`w-full px-4 py-3 flex items-center gap-3 border-b border-slate-800/50 last:border-b-0 transition-colors text-left ${
                    selectedVessel?.vesselId === vessel.vesselId
                      ? "bg-cyan-950/40 border-l-2 border-l-cyan-400"
                      : "hover:bg-slate-900/50"
                  }`}
                >
                  {/* Flag */}
                  <span className="text-lg" title={vessel.flag}>
                    {getFlagEmoji(vessel.flag)}
                  </span>

                  {/* Vessel info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-white truncate">
                      {vessel.name}
                    </p>
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

                  {/* Gap indicator (placeholder for future) */}
                  {vessel.hasGaps && (
                    <div
                      className="w-2 h-2 bg-amber-500 rounded-full"
                      title="Has AIS gaps"
                    />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Footer stats */}
          {!isLoading && vessels.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/30">
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-slate-600">
                  Total fishing hours
                </span>
                <span className="font-mono text-[10px] text-cyan-400">
                  {Math.round(
                    vessels.reduce((sum, v) => sum + v.fishingHours, 0)
                  ).toLocaleString()}h
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
