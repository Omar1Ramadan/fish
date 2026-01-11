"use client";

import { useState, useEffect, useCallback } from "react";
import type { Vessel } from "./VesselList";
import type { PredictionData } from "./PredictionOverlay";

// Gap event from API
export interface GapEvent {
  id: string;
  startTime: string;
  endTime: string;
  position: {
    lat: number;
    lon: number;
  };
  durationHours?: number;
  distanceKm?: number;
  intentionalDisabling?: boolean;
  regions?: {
    eez?: string[];
    rfmo?: string[];
    highSeas?: string[];
  };
  distanceFromShore?: {
    start?: number;
    end?: number;
  };
}

interface VesselPanelProps {
  vessel: Vessel | null;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onPredictionGenerated: (
    prediction: PredictionData | null,
    gapId: string | null
  ) => void;
  activePredictionGapId: string | null;
}

// Country flag emoji helper
const getFlagEmoji = (countryCode: string): string => {
  if (!countryCode || countryCode === "UNK" || countryCode.length !== 3) {
    return "🏴";
  }
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
  drifting_longlines: "Drifting Longline",
  set_longlines: "Set Longline",
  squid_jigger: "Squid Jigger",
  pole_and_line: "Pole & Line",
  trollers: "Troller",
  fixed_gear: "Fixed Gear",
  fishing: "Fishing",
  unknown: "Unknown",
};

export default function VesselPanel({
  vessel,
  startDate,
  endDate,
  onClose,
  onPredictionGenerated,
  activePredictionGapId,
}: VesselPanelProps) {
  const [gaps, setGaps] = useState<GapEvent[]>([]);
  const [isLoadingGaps, setIsLoadingGaps] = useState(false);
  const [gapsError, setGapsError] = useState<string | null>(null);
  const [predictingGapId, setPredictingGapId] = useState<string | null>(null);
  const [aggressionFactor, setAggressionFactor] = useState(1.0); // 0.25x to 10x multiplier
  const [activeGap, setActiveGap] = useState<GapEvent | null>(null); // Track active gap for auto-refresh

  // Fetch gaps when vessel changes
  const fetchGaps = useCallback(async () => {
    if (!vessel) {
      setGaps([]);
      return;
    }

    setIsLoadingGaps(true);
    setGapsError(null);

    try {
      const url = `/api/vessel-gaps?vessel-id=${encodeURIComponent(
        vessel.vesselId
      )}&start-date=${startDate}&end-date=${endDate}&limit=50`;

      console.log("[VesselPanel] Fetching gaps:", url);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch gaps: ${response.status}`);
      }

      const data = await response.json();
      console.log("[VesselPanel] Gaps received:", data);
      setGaps(data.gaps || []);
    } catch (err) {
      console.error("[VesselPanel] Error fetching gaps:", err);
      setGapsError(err instanceof Error ? err.message : "Failed to fetch gaps");
      setGaps([]);
    } finally {
      setIsLoadingGaps(false);
    }
  }, [vessel, startDate, endDate]);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  // Generate prediction for a specific gap
  const runPrediction = useCallback(
    async (gap: GapEvent, aggression: number) => {
      if (!vessel) return;

      setPredictingGapId(gap.id);

      try {
        const response = await fetch("/api/predict-path", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vesselId: vessel.vesselId,
            lastPosition: {
              lat: gap.position.lat,
              lon: gap.position.lon,
            },
            lastSpeed: 8.0, // Default speed estimate (knots)
            lastCourse: 0, // Will use model to estimate
            gapDurationHours: gap.durationHours || 12,
            modelType: "lstm",
            aggressionFactor: aggression, // Scales the prediction distance
          }),
        });

        if (!response.ok) {
          throw new Error(`Prediction failed: ${response.status}`);
        }

        const data = await response.json();
        console.log("[VesselPanel] Prediction result:", data);

        // Create PredictionData from response
        const predictionData: PredictionData = {
          startPosition: [gap.position.lat, gap.position.lon],
          predictedPosition: data.prediction.predictedPosition,
          uncertaintyNm: data.prediction.uncertaintyNm,
          probabilityCloud: data.probabilityCloud,
        };

        onPredictionGenerated(predictionData, gap.id);
      } catch (err) {
        console.error("[VesselPanel] Prediction error:", err);
      } finally {
        setPredictingGapId(null);
      }
    },
    [vessel, onPredictionGenerated]
  );

  // Handle predict button click
  const handlePredict = async (gap: GapEvent) => {
    if (!vessel) return;

    // If this gap already has an active prediction, toggle it off
    if (activePredictionGapId === gap.id) {
      onPredictionGenerated(null, null);
      setActiveGap(null);
      return;
    }

    setActiveGap(gap);
    await runPrediction(gap, aggressionFactor);
  };

  // Auto-refresh prediction when aggression slider changes
  useEffect(() => {
    if (activeGap && activePredictionGapId) {
      // Debounce the refresh to avoid too many API calls
      const timeoutId = setTimeout(() => {
        runPrediction(activeGap, aggressionFactor);
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [aggressionFactor, activeGap, activePredictionGapId, runPrediction]);

  // Format duration
  const formatDuration = (hours?: number): string => {
    if (!hours) return "Unknown";
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  if (!vessel) return null;

  return (
    <div className="bg-slate-950/95 backdrop-blur-md border border-orange-900/30 rounded-lg shadow-2xl shadow-orange-950/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl" title={vessel.flag}>
            {getFlagEmoji(vessel.flag)}
          </span>
          <div>
            <h3 className="font-mono text-sm font-semibold text-white">
              {vessel.name}
            </h3>
            <p className="font-mono text-[10px] text-slate-500">
              {gearTypeNames[vessel.gearType] || vessel.gearType}
              {vessel.mmsi && ` • ${vessel.mmsi}`}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-slate-800 rounded transition-colors"
        >
          <svg
            className="w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="px-4 py-2 bg-slate-900/50 flex items-center gap-4 text-[10px] font-mono">
        <div className="flex items-center gap-1">
          <span className="text-slate-500">Fishing:</span>
          <span className="text-cyan-400">
            {vessel.fishingHours.toFixed(1)}h
          </span>
        </div>
        {vessel.hasGaps && (
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Dark:</span>
            <span className="text-red-400">
              {Math.round(vessel.totalGapHours || 0)}h
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-slate-500">Gaps:</span>
          <span className="text-orange-400">{gaps.length}</span>
        </div>
      </div>

      {/* Prediction Range Slider */}
      <div className="px-4 py-3 border-t border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs text-slate-400 uppercase">
            Prediction Range
          </span>
          <span className="font-mono text-sm font-bold text-slate-300">
            {aggressionFactor.toFixed(1)}x
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0.25"
            max="10"
            step="0.25"
            value={aggressionFactor}
            onChange={(e) => setAggressionFactor(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                       [&::-webkit-slider-thumb]:bg-slate-300 [&::-webkit-slider-thumb]:rounded-full 
                       [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-500
                       [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] text-slate-500 font-mono">0.25x</span>
          <span className="text-[9px] text-slate-500 font-mono">10x</span>
        </div>
      </div>

      {/* Gaps Section */}
      <div className="border-t border-slate-800">
        <div className="px-4 py-2 bg-slate-900/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-400 rounded-full" />
            <span className="font-mono text-xs text-slate-400 uppercase">
              AIS Gap Events
            </span>
          </div>
        </div>

        {/* Loading State */}
        {isLoadingGaps && (
          <div className="px-4 py-8 flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="font-mono text-xs text-slate-500">
              Loading gaps...
            </span>
          </div>
        )}

        {/* Error State */}
        {gapsError && !isLoadingGaps && (
          <div className="px-4 py-4">
            <div className="bg-red-950/50 border border-red-900/50 rounded px-3 py-2">
              <p className="font-mono text-xs text-red-400">{gapsError}</p>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoadingGaps && !gapsError && gaps.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="font-mono text-xs text-slate-500">
              No AIS gaps detected for this vessel
            </p>
            <p className="font-mono text-[10px] text-slate-600 mt-1">
              in the selected date range
            </p>
          </div>
        )}

        {/* Gap List */}
        {!isLoadingGaps && !gapsError && gaps.length > 0 && (
          <div className="max-h-64 overflow-y-auto">
            {gaps.map((gap, index) => {
              const isActive = activePredictionGapId === gap.id;
              const isPredicting = predictingGapId === gap.id;

              return (
                <div
                  key={gap.id}
                  className={`px-4 py-3 border-b border-slate-800/50 last:border-b-0 transition-colors ${
                    isActive
                      ? "bg-orange-950/40 border-l-2 border-l-orange-400"
                      : "hover:bg-slate-900/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Gap Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white">
                          Gap #{index + 1}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                            (gap.durationHours || 0) > 24
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : (gap.durationHours || 0) > 6
                              ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                              : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                          }`}
                        >
                          {formatDuration(gap.durationHours)}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-slate-500">
                        {formatDate(gap.startTime)} → {formatDate(gap.endTime)}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-600">
                        Position: {gap.position?.lat?.toFixed?.(4) ?? "?"}°,{" "}
                        {gap.position?.lon?.toFixed?.(4) ?? "?"}°
                        {typeof gap.distanceKm === "number" &&
                          ` • ${gap.distanceKm.toFixed(0)}km traveled`}
                      </div>
                    </div>

                    {/* Predict Button */}
                    <button
                      onClick={() => handlePredict(gap)}
                      disabled={isPredicting}
                      className={`px-3 py-1.5 rounded text-[10px] font-mono uppercase transition-colors flex items-center gap-1.5 ${
                        isActive
                          ? "bg-orange-600 text-white hover:bg-orange-500"
                          : isPredicting
                          ? "bg-slate-700 text-slate-400 cursor-wait"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                      }`}
                    >
                      {isPredicting ? (
                        <>
                          <div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                          <span>Predicting...</span>
                        </>
                      ) : isActive ? (
                        <span>Hide</span>
                      ) : (
                        <span>Predict</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/30">
        <p className="font-mono text-[10px] text-slate-600">
          Click &quot;Predict Path&quot; to see where the vessel may have gone
          during the AIS gap
        </p>
      </div>
    </div>
  );
}
