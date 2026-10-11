import React from "react";
import { LOGO_ALT, LOGO_SRC } from "@/app/brand";

interface PremidisLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
}

/*
 * Logo officiel PREMIDIS S.A.R.L. : l'image fournie (src/app/brand.ts), jamais redessinée.
 * `size` garde la même hauteur d'affichage que l'ancien emblème (80 % de la valeur) ; la largeur
 * suit les proportions de l'image. Fond clair dans les deux thèmes pour rester lisible.
 */
export default function PremidisLogo({
  className = "",
  size = 48,
  showText = false,
}: PremidisLogoProps) {
  const height = typeof size === "number" ? size * 0.8 : `calc(${size} * 0.8)`;
  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <img
        src={LOGO_SRC}
        alt={LOGO_ALT}
        style={{ height, width: "auto" }}
        className="logo-tile shrink-0 rounded-md object-contain"
        data-premidis-logo
      />
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
