"use client";

import { useState } from "react";

// Common fishing nations with their ISO3 codes
const COUNTRIES = [
  { code: "CHN", name: "China", flag: "🇨🇳" },
  { code: "ECU", name: "Ecuador", flag: "🇪🇨" },
  { code: "ESP", name: "Spain", flag: "🇪🇸" },
  { code: "TWN", name: "Taiwan", flag: "🇹🇼" },
  { code: "JPN", name: "Japan", flag: "🇯🇵" },
  { code: "KOR", name: "South Korea", flag: "🇰🇷" },
  { code: "USA", name: "United States", flag: "🇺🇸" },
  { code: "RUS", name: "Russia", flag: "🇷🇺" },
  { code: "PER", name: "Peru", flag: "🇵🇪" },
  { code: "CHL", name: "Chile", flag: "🇨🇱" },
  { code: "ARG", name: "Argentina", flag: "🇦🇷" },
  { code: "PAN", name: "Panama", flag: "🇵🇦" },
];

interface CountryFilterProps {
  excludedCountries: string[];
  onExcludedCountriesChange: (countries: string[]) => void;
}

export default function CountryFilter({
  excludedCountries,
  onExcludedCountriesChange,
}: CountryFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleCountry = (code: string) => {
    if (excludedCountries.includes(code)) {
      onExcludedCountriesChange(excludedCountries.filter((c) => c !== code));
    } else {
      onExcludedCountriesChange([...excludedCountries, code]);
    }
  };

  const clearAll = () => {
    onExcludedCountriesChange([]);
  };

  return (
    <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg overflow-hidden shadow-2xl shadow-cyan-950/20">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-amber-400 rounded-full" />
          <span className="font-mono text-sm text-slate-300 uppercase tracking-wider">
            Country Filter
          </span>
          {excludedCountries.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-mono rounded">
              {excludedCountries.length} excluded
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

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 border-t border-cyan-900/20">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500 font-mono uppercase">
              Exclude countries from view
            </span>
            {excludedCountries.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {COUNTRIES.map((country) => {
              const isExcluded = excludedCountries.includes(country.code);
              return (
                <button
                  key={country.code}
                  onClick={() => toggleCountry(country.code)}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-left text-sm font-mono transition-all ${
                    isExcluded
                      ? "bg-amber-500/20 border border-amber-500/50 text-amber-300"
                      : "bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  <span>{country.flag}</span>
                  <span className="truncate">{country.name}</span>
                  {isExcluded && (
                    <span className="ml-auto text-amber-400">✕</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/50 text-[10px] text-slate-600 font-mono">
            Excluded countries will be hidden from the fishing activity heatmap
          </div>
        </div>
      )}
    </div>
  );
}
