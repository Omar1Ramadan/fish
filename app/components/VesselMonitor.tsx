"use client";

import { useState, useEffect, useCallback } from "react";

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
}

interface VesselEvent {
  vesselId: string;
  vesselName?: string;
  flag?: string;
  lastSeen: string;
  lastLat: number;
  lastLon: number;
  hoursMissing: number;
  riskLevel: "low" | "medium" | "high";
}

interface VesselData {
  vesselId?: string;
  entryTimestamp?: string;
  flag?: string;
  hours?: number;
}

interface VesselMonitorProps {
  selectedEEZ: EEZRegion | null;
  startDate: string;
  endDate: string;
  bufferValue: number;
}

export default function VesselMonitor({
  selectedEEZ,
  startDate,
  endDate,
  bufferValue,
}: VesselMonitorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [vesselEvents, setVesselEvents] = useState<VesselEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchVesselData = useCallback(async () => {
    if (!selectedEEZ) return;

    setIsLoading(true);
    try {
      // Fetch vessel presence data for the EEZ region
      const response = await fetch("/api/eez-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          regionId: selectedEEZ.id,
          regionDataset: selectedEEZ.dataset,
          startDate,
          endDate,
          dataset: "public-global-presence:latest",
          format: "JSON",
          temporalResolution: "DAILY",
          groupBy: "VESSEL_ID",
          spatialAggregation: true,
          spatialResolution: "LOW",
          bufferValue: bufferValue > 0 ? bufferValue : undefined,
          bufferUnit: bufferValue > 0 ? "NAUTICALMILES" : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch vessel data");
      }

      const data = await response.json();

      // Process the data to identify potential dark zone events
      // This is a simplified version - in production, you'd analyze AIS gaps
      const events: VesselEvent[] = [];

      if (data.entries && data.entries.length > 0) {
        const datasetKey = Object.keys(data.entries[0])[0];
        const vessels = data.entries[0][datasetKey] || [];

        // For each vessel, check if there are gaps in presence
        // This is a placeholder - real implementation would track AIS off events
        vessels.forEach((vessel: VesselData) => {
          if (vessel.vesselId && vessel.entryTimestamp) {
            const lastSeen = new Date(vessel.entryTimestamp);
            const now = new Date();
            const hoursMissing =
              (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60);

            // Flag vessels that haven't been seen in the last 24 hours as potential dark zones
            if (hoursMissing > 24 && hoursMissing < 168) {
              // 1-7 days
              events.push({
                vesselId: vessel.vesselId,
                vesselName: "Unknown",
                flag: vessel.flag || "Unknown",
                lastSeen: vessel.entryTimestamp,
                lastLat: 0,
                lastLon: 0,
                hoursMissing: Math.round(hoursMissing),
                riskLevel:
                  hoursMissing > 72
                    ? "high"
                    : hoursMissing > 48
                    ? "medium"
                    : "low",
              });
            }
          }
        });
      }

      setVesselEvents(events);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch vessel data:", error);
      setVesselEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedEEZ, startDate, endDate, bufferValue]);

  useEffect(() => {
    if (selectedEEZ && isExpanded) {
      fetchVesselData();
    } else {
      setVesselEvents([]);
    }
  }, [selectedEEZ, isExpanded, fetchVesselData]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "high":
        return "text-red-400 border-red-700/50 bg-red-950/20";
      case "medium":
        return "text-orange-400 border-orange-700/50 bg-orange-950/20";
      default:
        return "text-yellow-400 border-yellow-700/50 bg-yellow-950/20";
    }
  };

  return (
    <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg overflow-hidden shadow-2xl shadow-cyan-950/20">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
          <span className="font-mono text-sm text-slate-300 uppercase tracking-wider">
            Dark Zone Monitor
          </span>
          {vesselEvents.length > 0 && (
            <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-400 font-mono">
              {vesselEvents.length}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-cyan-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {!selectedEEZ ? (
            <div className="text-xs text-slate-500 font-mono text-center py-4">
              Select an EEZ region to monitor
            </div>
          ) : isLoading ? (
            <div className="text-xs text-slate-500 font-mono text-center py-4">
              <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Analyzing vessel activity...
            </div>
          ) : vesselEvents.length === 0 ? (
            <div className="text-xs text-slate-500 font-mono text-center py-4">
              No dark zone events detected
            </div>
          ) : (
            <>
              <div className="font-mono text-xs text-slate-500 uppercase">
                Potential Dark Zone Events
              </div>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {vesselEvents.map((event, idx) => (
                  <div
                    key={`${event.vesselId}-${idx}`}
                    className={`p-3 rounded border ${getRiskColor(
                      event.riskLevel
                    )}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-mono text-sm font-semibold">
                          {event.vesselName}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {event.flag} • {event.vesselId.substring(0, 8)}...
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                          event.riskLevel === "high"
                            ? "bg-red-500/20 text-red-400"
                            : event.riskLevel === "medium"
                            ? "bg-orange-500/20 text-orange-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {event.riskLevel}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-400 space-y-1">
                      <div>
                        Last seen: {new Date(event.lastSeen).toLocaleString()}
                      </div>
                      <div>Missing: ~{event.hoursMissing} hours</div>
                      <div>
                        Last position: {event.lastLat.toFixed(2)}°,{" "}
                        {event.lastLon.toFixed(2)}°
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {lastUpdate && (
                <div className="text-[10px] text-slate-600 font-mono pt-2 border-t border-slate-800">
                  Last update: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </>
          )}

          {/* Info */}
          <div className="text-xs text-slate-500 font-mono pt-2 border-t border-slate-800">
            Detects vessels that go dark near protected zones
          </div>
        </div>
      )}
    </div>
  );
}
