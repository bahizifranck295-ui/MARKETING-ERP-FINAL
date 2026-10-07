import React from "react";
import PremidisLogo from "./PremidisLogo";

export default function BrandLogo({ size = 34 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <PremidisLogo size={size} />
      <div className="flex flex-col">
        <span className="font-black text-sm tracking-tight text-[#211A5C] leading-tight">
          PREMIDIS SARL
        </span>
        <span className="text-[10px] text-slate-500 font-semibold leading-none uppercase tracking-wider">
          Distribution & Ventes
        </span>
      </div>
    </div>
  );
}
