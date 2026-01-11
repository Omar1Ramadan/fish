'use client';

import { useState } from 'react';

interface TimeControlsProps {
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
}

// GFW data has ~96hr delay, so we offset end dates by 5 days
const DATA_DELAY_DAYS = 5;

const presets = [
  { label: 'Last 30 Days', days: 30 },
  { label: 'Last 90 Days', days: 90 },
  { label: 'Last Year', days: 365 },
  { label: '2024', start: '2024-01-01', end: '2024-12-31' },
  { label: '2023', start: '2023-01-01', end: '2023-12-31' },
];

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDateFromDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

export default function TimeControls({ startDate, endDate, onDateChange }: TimeControlsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePresetClick = (preset: typeof presets[0]) => {
    if ('days' in preset && preset.days) {
      // End date is 5 days ago (data delay), start is days before that
      const end = getDateFromDaysAgo(DATA_DELAY_DAYS);
      const start = getDateFromDaysAgo(preset.days + DATA_DELAY_DAYS);
      onDateChange(start, end);
    } else if ('start' in preset && 'end' in preset && preset.start && preset.end) {
      onDateChange(preset.start, preset.end);
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
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
          <span className="font-mono text-sm text-slate-300 uppercase tracking-wider">
            Time Range
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-cyan-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Current Range Display */}
      <div className="px-4 pb-3 border-b border-cyan-900/20">
        <div className="font-mono text-xs text-cyan-400/70 mb-1">ACTIVE PERIOD</div>
        <div className="font-mono text-sm text-white">
          {startDate} <span className="text-cyan-600">→</span> {endDate}
        </div>
      </div>

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Presets */}
          <div>
            <div className="font-mono text-xs text-slate-500 uppercase mb-2">Quick Select</div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className="px-3 py-1.5 text-xs font-mono bg-slate-800/50 hover:bg-cyan-900/30 border border-slate-700/50 hover:border-cyan-700/50 rounded transition-all text-slate-300 hover:text-cyan-300"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate-500 uppercase mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => onDateChange(e.target.value, endDate)}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white font-mono focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600/50"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-slate-500 uppercase mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => onDateChange(startDate, e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white font-mono focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600/50"
              />
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-slate-500 font-mono">
            Data available: 2012-01-01 → ~4 days ago
          </div>
        </div>
      )}
    </div>
  );
}
