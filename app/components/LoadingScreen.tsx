"use client";

import { useState, useEffect } from "react";
import Globe3D from "./Globe3D";

interface LoadingScreenProps {
  onLoadingComplete: () => void;
  isMapReady: boolean;
}

export default function LoadingScreen({
  onLoadingComplete,
  isMapReady,
}: LoadingScreenProps) {
  const [phase, setPhase] = useState<"visible" | "blink1" | "on1" | "blink2" | "hold" | "fadeout" | "done">("visible");

  // Initial show -> blink1 -> on -> blink2 -> hold -> wait for map -> fadeout
  useEffect(() => {
    // Show for half a second, then first blink
    const blinkTimer = setTimeout(() => setPhase("blink1"), 500);
    return () => clearTimeout(blinkTimer);
  }, []);

  useEffect(() => {
    if (phase === "blink1") {
      // First blink - fade out then back on
      const onTimer = setTimeout(() => setPhase("on1"), 120);
      return () => clearTimeout(onTimer);
    }
    if (phase === "on1") {
      // Brief on, then second blink
      const blink2Timer = setTimeout(() => setPhase("blink2"), 150);
      return () => clearTimeout(blink2Timer);
    }
    if (phase === "blink2") {
      // Second blink, then hold
      const holdTimer = setTimeout(() => setPhase("hold"), 120);
      return () => clearTimeout(holdTimer);
    }
  }, [phase]);

  // When map is ready and we're holding, fade out
  useEffect(() => {
    if (phase === "hold" && isMapReady) {
      const fadeTimer = setTimeout(() => setPhase("fadeout"), 200);
      return () => clearTimeout(fadeTimer);
    }
  }, [phase, isMapReady]);

  // Complete after fadeout
  useEffect(() => {
    if (phase === "fadeout") {
      const doneTimer = setTimeout(() => {
        setPhase("done");
        onLoadingComplete();
      }, 350);
      return () => clearTimeout(doneTimer);
    }
  }, [phase, onLoadingComplete]);

  if (phase === "done") return null;

  const isBlinkOff = phase === "blink1" || phase === "blink2";

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-500 ${
        phase === "fadeout" ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background: "radial-gradient(ellipse at center, #0a1628 0%, #030712 100%)",
      }}
    >
      {/* Main content */}
      <div className="flex flex-col items-center gap-10">
        {/* Globe */}
        <Globe3D size={180} />

        {/* FISH text */}
        <h1
          className={`font-mono text-8xl font-black tracking-wider text-cyan-400 transition-opacity duration-75 ease-in-out ${
            isBlinkOff ? "opacity-0" : "opacity-100"
          }`}
        >
          FISH
        </h1>

        {/* Credits */}
        <div className="flex flex-col items-center gap-1 mt-8">
          <p className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">
            by
          </p>
          <p className="font-mono text-xs text-slate-500 tracking-wide">
            Omar Ramadan · Ahmed Khaleel · Benji Avdullahu
          </p>
        </div>
      </div>
    </div>
  );
}
