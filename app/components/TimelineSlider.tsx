"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface TimelineSliderProps {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
}

// GFW data availability - show only past year for cleaner UI
const DATA_DELAY_DAYS = 5; // GFW has ~96hr delay

function getDataStartDate(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date;
}

function getDataEndDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - DATA_DELAY_DAYS);
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Quick select presets
const PRESETS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "1Y", days: 365 },
];

export default function TimelineSlider({
  startDate,
  endDate,
  onDateChange,
}: TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<
    "start" | "end" | "window" | null
  >(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartDates, setDragStartDates] = useState({
    start: startDate,
    end: endDate,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // days per tick
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const dataStart = getDataStartDate();
  const dataEnd = getDataEndDate();
  const totalDays = daysBetween(dataStart, dataEnd);

  // Convert dates to positions (0-1)
  const startPos = daysBetween(dataStart, parseDate(startDate)) / totalDays;
  const endPos = daysBetween(dataStart, parseDate(endDate)) / totalDays;

  // Clamp position between 0 and 1
  const clamp = (val: number, min: number = 0, max: number = 1) =>
    Math.min(Math.max(val, min), max);

  // Convert position to date
  const posToDate = useCallback(
    (pos: number): string => {
      const days = Math.round(pos * totalDays);
      const date = addDays(dataStart, days);
      // Clamp to valid range
      if (date < dataStart) return formatDate(dataStart);
      if (date > dataEnd) return formatDate(dataEnd);
      return formatDate(date);
    },
    [totalDays, dataStart, dataEnd]
  );

  // Handle mouse down on handles or window
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: "start" | "end" | "window") => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(type);
      setDragStartX(e.clientX);
      setDragStartDates({ start: startDate, end: endDate });
    },
    [startDate, endDate]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !trackRef.current) return;

      const trackRect = trackRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      const deltaPos = deltaX / trackRect.width;

      const origStartPos =
        daysBetween(dataStart, parseDate(dragStartDates.start)) / totalDays;
      const origEndPos =
        daysBetween(dataStart, parseDate(dragStartDates.end)) / totalDays;
      const windowSize = origEndPos - origStartPos;

      if (isDragging === "start") {
        let newStartPos = clamp(origStartPos + deltaPos, 0, origEndPos - 0.001);
        // Enforce max 366 days
        const maxWindowDays = 366;
        const minStartPos = origEndPos - maxWindowDays / totalDays;
        newStartPos = Math.max(newStartPos, minStartPos);
        onDateChange(posToDate(newStartPos), dragStartDates.end);
      } else if (isDragging === "end") {
        let newEndPos = clamp(origEndPos + deltaPos, origStartPos + 0.001, 1);
        // Enforce max 366 days
        const maxWindowDays = 366;
        const maxEndPos = origStartPos + maxWindowDays / totalDays;
        newEndPos = Math.min(newEndPos, maxEndPos);
        onDateChange(dragStartDates.start, posToDate(newEndPos));
      } else if (isDragging === "window") {
        let newStartPos = origStartPos + deltaPos;
        let newEndPos = origEndPos + deltaPos;

        // Keep window size, but clamp to bounds
        if (newStartPos < 0) {
          newStartPos = 0;
          newEndPos = windowSize;
        }
        if (newEndPos > 1) {
          newEndPos = 1;
          newStartPos = 1 - windowSize;
        }

        onDateChange(posToDate(newStartPos), posToDate(newEndPos));
      }
    },
    [
      isDragging,
      dragStartX,
      dragStartDates,
      totalDays,
      onDateChange,
      posToDate,
      dataStart,
    ]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  // Add/remove event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Playback logic
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        const currentStart = parseDate(startDate);
        const currentEnd = parseDate(endDate);

        const newStart = addDays(currentStart, playbackSpeed);
        const newEnd = addDays(currentEnd, playbackSpeed);

        // Stop if we hit the end
        if (newEnd > dataEnd) {
          setIsPlaying(false);
          return;
        }

        onDateChange(formatDate(newStart), formatDate(newEnd));
      }, 500); // Update every 500ms

      return () => {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
        }
      };
    }
  }, [isPlaying, startDate, endDate, playbackSpeed, dataEnd, onDateChange]);

  // Quick preset handler
  const handlePreset = (days: number) => {
    const end = dataEnd;
    const start = addDays(end, -days);
    onDateChange(formatDate(start), formatDate(end));
    setIsPlaying(false);
  };

  // Generate month markers (since we're only showing 1 year)
  const monthMarkers = [];
  const startYear = dataStart.getFullYear();
  const startMonth = dataStart.getMonth();
  for (let i = 0; i <= 12; i++) {
    const monthDate = new Date(startYear, startMonth + i, 1);
    const pos = daysBetween(dataStart, monthDate) / totalDays;
    if (pos >= 0 && pos <= 1) {
      const label = monthDate.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
      monthMarkers.push({ label, pos });
    }
  }

  const windowDays = daysBetween(parseDate(startDate), parseDate(endDate));

  return (
    <div className="bg-slate-950/95 backdrop-blur-md border-t border-cyan-900/30 shadow-2xl shadow-cyan-950/20">
      {/* Main timeline container */}
      <div className="px-6 py-4">
        {/* Top row: Date display and controls */}
        <div className="flex items-center justify-between mb-3">
          {/* Current selection display */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="font-mono text-xs text-slate-400 uppercase tracking-wider">
                Selected Range
              </span>
            </div>
            <div className="font-mono text-sm text-white">
              <span className="text-cyan-400">{startDate}</span>
              <span className="text-slate-500 mx-2">→</span>
              <span className="text-cyan-400">{endDate}</span>
              <span className="text-slate-500 ml-3 text-xs">
                ({windowDays} days)
              </span>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-500 uppercase mr-2">
              Quick:
            </span>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset.days)}
                className="px-2 py-1 text-xs font-mono bg-slate-800/50 hover:bg-cyan-900/30 border border-slate-700/50 hover:border-cyan-700/50 rounded transition-all text-slate-300 hover:text-cyan-300"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Playback controls */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-500 uppercase">
              Playback:
            </span>

            {/* Rewind to start */}
            <button
              onClick={() => {
                const windowDays = daysBetween(
                  parseDate(startDate),
                  parseDate(endDate)
                );
                const newEnd = addDays(dataStart, windowDays);
                onDateChange(formatDate(dataStart), formatDate(newEnd));
                setIsPlaying(false);
              }}
              className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800/50 rounded transition-all"
              title="Go to start"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded-full transition-all ${
                isPlaying
                  ? "bg-cyan-500 text-slate-900"
                  : "bg-slate-800/50 text-slate-300 hover:bg-cyan-900/30 hover:text-cyan-300 border border-slate-700/50"
              }`}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Speed control */}
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="bg-slate-800/50 border border-slate-700/50 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:border-cyan-600 focus:outline-none"
            >
              <option value={1}>1 day</option>
              <option value={7}>1 week</option>
              <option value={30}>1 month</option>
            </select>
          </div>
        </div>

        {/* Timeline track */}
        <div className="relative h-12 mt-2">
          {/* Month markers */}
          <div className="absolute inset-x-0 top-0 h-4 flex items-end">
            {monthMarkers.map(({ label, pos }) => (
              <div
                key={label}
                className="absolute text-[10px] font-mono text-slate-500"
                style={{ left: `${pos * 100}%`, transform: "translateX(-50%)" }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Track background with month ticks */}
          <div
            ref={trackRef}
            className="absolute inset-x-0 top-6 h-6 bg-slate-800/50 rounded-full border border-slate-700/30 cursor-pointer overflow-hidden"
            onClick={(e) => {
              if (!trackRef.current) return;
              const rect = trackRef.current.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              const windowSize = endPos - startPos;
              const halfWindow = windowSize / 2;
              let newStart = pos - halfWindow;
              let newEnd = pos + halfWindow;
              if (newStart < 0) {
                newStart = 0;
                newEnd = windowSize;
              }
              if (newEnd > 1) {
                newEnd = 1;
                newStart = 1 - windowSize;
              }
              onDateChange(posToDate(newStart), posToDate(newEnd));
            }}
          >
            {/* Month tick marks */}
            {monthMarkers.map(({ label, pos }) => (
              <div
                key={label}
                className="absolute top-0 bottom-0 w-px bg-slate-600/30"
                style={{ left: `${pos * 100}%` }}
              />
            ))}

            {/* Selection window */}
            <div
              className="absolute top-0 bottom-0 bg-cyan-500/20 border-y border-cyan-500/40 cursor-move"
              style={{
                left: `${startPos * 100}%`,
                width: `${(endPos - startPos) * 100}%`,
              }}
              onMouseDown={(e) => handleMouseDown(e, "window")}
            >
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-linear-to-b from-cyan-400/10 to-transparent" />
            </div>

            {/* Start handle */}
            <div
              className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize group z-10"
              style={{ left: `${startPos * 100}%` }}
              onMouseDown={(e) => handleMouseDown(e, "start")}
            >
              <div className="absolute inset-y-0 left-1/2 w-1 -ml-0.5 bg-cyan-400 group-hover:bg-cyan-300 transition-colors rounded-full shadow-lg shadow-cyan-500/50" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-cyan-400 group-hover:bg-cyan-300 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* End handle */}
            <div
              className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize group z-10"
              style={{ left: `${endPos * 100}%` }}
              onMouseDown={(e) => handleMouseDown(e, "end")}
            >
              <div className="absolute inset-y-0 left-1/2 w-1 -ml-0.5 bg-cyan-400 group-hover:bg-cyan-300 transition-colors rounded-full shadow-lg shadow-cyan-500/50" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-cyan-400 group-hover:bg-cyan-300 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Date range labels */}
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] font-mono text-slate-500">
            <span>{formatDate(dataStart)}</span>
            <span>{formatDate(dataEnd)} (latest available)</span>
          </div>
        </div>

        {/* Info footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/50">
          <div className="text-[10px] text-slate-600 font-mono">
            <span className="text-yellow-500/70">⚠</span> GFW data has ~5 day
            delay • Max 366 days per query
          </div>
          <div className="text-[10px] text-slate-600 font-mono">
            Drag handles to adjust • Click track to center window
          </div>
        </div>
      </div>
    </div>
  );
}
