import React from "react";

interface PremidisLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

export default function PremidisLogo({
  className = "",
  size = 48,
  showText = false,
}: PremidisLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      {/* SVG Emblem with high fidelity matching the uploaded image */}
      <svg
        viewBox="0 0 100 80"
        style={{ width: size, height: "auto" }}
        className="shrink-0 overflow-visible"
        aria-label="PREMIDIS SARL Logo"
      >
        <defs>
          <linearGradient id="premBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="50%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="premPurple" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B0764" />
            <stop offset="50%" stopColor="#7E22CE" />
            <stop offset="100%" stopColor="#C084FC" />
          </linearGradient>
          <filter id="premShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0F172A" floodOpacity="0.12" />
          </filter>
        </defs>
        {/* Outer oval boundary */}
        <ellipse
          cx="50"
          cy="40"
          rx="45"
          ry="34"
          fill="#FFFFFF"
          stroke="#E2E8F0"
          strokeWidth="1.2"
        />
        <g filter="url(#premShadow)">
          {/* Intertwined Loop 1 - Blue (Left 'P' loop) */}
          <path
            d="M 44 20 C 30 20 22 28 22 40 C 22 52 30 60 44 60 C 56 60 61 50 59 40 C 57 32 50 24 38 22 C 32 21 28 26 31 31 C 33 34 37 36 43 37 C 50 39 52 44 50 48 C 48 53 43 55 38 55 C 30 55 27 49 27 40 C 27 31 32 24 44 24 Z"
            fill="url(#premBlue)"
          />
          {/* Intertwined Loop 2 - Purple (Right 'D' loop) */}
          <path
            d="M 56 60 C 70 60 78 52 78 40 C 78 28 70 20 56 20 C 44 20 39 30 41 40 C 43 48 50 56 62 58 C 68 59 72 54 69 49 C 67 46 63 44 57 43 C 50 41 48 36 50 32 C 52 27 57 25 62 25 C 70 25 73 31 73 40 C 73 49 68 56 56 56 Z"
            fill="url(#premPurple)"
          />
          {/* Top flourish ribbon curve */}
          <path
            d="M 64 26 C 68 18 75 14 81 17 C 86 21 84 27 77 32 Z"
            fill="url(#premPurple)"
          />
        </g>
      </svg>
      {showText && (
        <div className="flex flex-col">
          <span className="font-black text-sm tracking-widest text-ink leading-none">
            PREMIDIS
          </span>
          <span className="text-[10px] font-black tracking-[0.28em] text-ink leading-tight">
            S.A.R.L
          </span>
        </div>
      )}
    </div>
  );
}
