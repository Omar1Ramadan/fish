"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import TimeControls from "./components/TimeControls";
import EEZSelector from "./components/EEZSelector";
import VesselMonitor from "./components/VesselMonitor";

// Dynamic import to avoid SSR issues with Mapbox
const FishingMap = dynamic(() => import("./components/FishingMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-cyan-400 font-mono text-sm">
          LOADING MAP MODULE...
        </span>
      </div>
    </div>
  ),
});

// Keeping for potential future use
// function formatDate(date: Date): string {
//   return date.toISOString().split("T")[0];
// }
// function getDateFromDaysAgo(days: number): string {
//   const date = new Date();
//   date.setDate(date.getDate() - days);
//   return formatDate(date);
// }

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
}

export default function Home() {
  // Use a single month of 2024 data - full year saturates colors
  // GFW data has ~96hr delay so recent dates may fail
  const [startDate, setStartDate] = useState("2024-03-01");
  const [endDate, setEndDate] = useState("2024-03-31");
  const [selectedEEZ, setSelectedEEZ] = useState<EEZRegion | null>(null);
  const [eezBuffer, setEezBuffer] = useState(0);

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden">
      {/* Map takes full viewport */}
      <FishingMap
        startDate={startDate}
        endDate={endDate}
        selectedEEZ={selectedEEZ}
        eezBuffer={eezBuffer}
      />

      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none">
        <div className="flex items-start justify-between">
          {/* Logo/Title */}
          <div className="pointer-events-auto">
            <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg px-4 py-3 shadow-2xl shadow-cyan-950/20">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 bg-cyan-400 rounded-full" />
                  <div className="absolute inset-0 w-3 h-3 bg-cyan-400 rounded-full animate-ping opacity-75" />
                </div>
                <div>
                  <h1 className="font-mono text-lg font-bold text-white tracking-tight">
                    FISHING WATCH
                  </h1>
                  <p className="font-mono text-[10px] text-cyan-400/70 uppercase tracking-widest">
                    Global Activity Monitor
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Time Controls */}
          <div className="pointer-events-auto w-72">
            <TimeControls
              startDate={startDate}
              endDate={endDate}
              onDateChange={handleDateChange}
            />
          </div>
        </div>
      </div>

      {/* EEZ Selector */}
      <div className="absolute top-4 right-4 pointer-events-auto">
        <div className="w-80 space-y-3">
          <EEZSelector
            selectedRegion={selectedEEZ}
            onRegionSelect={setSelectedEEZ}
            onBufferChange={setEezBuffer}
            bufferValue={eezBuffer}
          />
          <VesselMonitor
            selectedEEZ={selectedEEZ}
            startDate={startDate}
            endDate={endDate}
            bufferValue={eezBuffer}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 pointer-events-auto">
        <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg px-4 py-3 shadow-2xl shadow-cyan-950/20">
          <div className="font-mono text-xs text-slate-500 uppercase mb-2">
            Fishing Intensity
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 rounded-full bg-linear-to-r from-transparent via-orange-500 to-red-500" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[10px] text-slate-600">Low</span>
            <span className="font-mono text-[10px] text-slate-600">High</span>
          </div>
        </div>
      </div>

      {/* Info panel */}
      <div className="absolute left-4 top-24 pointer-events-auto max-w-xs">
        <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg px-4 py-3 shadow-2xl shadow-cyan-950/20">
          <div className="font-mono text-xs text-slate-500 uppercase mb-2">
            Data Source
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            AIS apparent fishing effort from{" "}
            <a
              href="https://globalfishingwatch.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >
              Global Fishing Watch
            </a>
            . Brighter areas indicate more fishing hours.
          </p>
          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="font-mono text-[10px] text-slate-600">
              TIP: Zoom into the Galápagos Islands to see fishing fleet clusters
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
