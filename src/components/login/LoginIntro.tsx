import { useCallback, useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { LOGO_ALT, LOGO_SRC, LOGO_TRANSPARENT_SRC } from "@/app/brand";
import "./intro.css";

/*
 * Introduction animée : à chaque affichage de la page de connexion (ouverture du projet, déconnexion)
 * et à chaque ouverture du projet avec une session déjà active.
 * 1. Écran sombre, horizon bleu lumineux et sol réfléchissant.
 * 2. Le symbole apparaît de profil, pivote ; les anneaux bleu et violet se déploient et s'assemblent.
 * 3. Le logo se stabilise de face ; « PREMIDIS S.A.R.L. » apparaît progressivement, reflet au sol.
 * 4. Courte pause, puis le logo se réduit et rejoint sa place sur la page de connexion (onReveal),
 *    pendant que l'arrière-plan, le formulaire et les comptes de démonstration apparaissent.
 * Le logo affiché est toujours l'image officielle (jamais redessinée) ; l'introduction peut être passée.
 * Mode sombre : les anneaux s'assemblent sans fond blanc ; la plaque blanche n'apparaît qu'avec le nom.
 */

const BUILD_MS = 5700; // logo construit + nom révélé + courte pause
const LEAVE_MS = 1100; // déplacement du logo vers la page de connexion

/** Introduction d'ouverture en cours (session active) : la page de connexion ne la rejoue pas par-dessus */
export const startupIntro = { playing: false };

export function shouldPlayIntro(): boolean {
  if (typeof window === "undefined" || startupIntro.playing) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: `${8 + ((i * 37) % 84)}%`,
  delay: `${1 + ((i * 0.43) % 3)}s`,
  duration: `${2.6 + ((i * 0.7) % 1.8)}s`,
}));

export function LoginIntro({
  target,
  onReveal,
  onDone,
}: {
  /** Élément du logo sur la page de connexion, vers lequel le logo de l'introduction se déplace (sinon il s'efface) */
  target?: () => HTMLElement | null;
  onReveal: () => void;
  onDone: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);
  const timers = useRef<number[]>([]);

  // Mode sombre : anneaux assemblés sans fond blanc (comme sur le modèle)
  const [dark] = useState(() => typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark");
  const [noTarget, setNoTarget] = useState(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    onReveal();
    onDone();
  }, [onReveal, onDone]);

  const leave = useCallback(() => {
    if (finished.current) return;
    const stage = stageRef.current;
    const plate = plateRef.current;
    const el = target?.() ?? null;
    if (!el) setNoTarget(true);
    if (stage && plate && el) {
      const from = plate.getBoundingClientRect();
      const to = el.getBoundingClientRect();
      if (from.width > 0 && to.width > 0) {
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const s = to.width / from.width;
        stage.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${s})`;
      }
    }
    setLeaving(true);
    onReveal();
    timers.current.push(window.setTimeout(finish, LEAVE_MS));
  }, [target, onReveal, finish]);

  useEffect(() => {
    timers.current.push(window.setTimeout(leave, BUILD_MS));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      timers.current.forEach(clearTimeout);
      window.removeEventListener("keydown", onKey);
    };
  }, [leave, finish]);

  return (
    <div className={`intro-root ${leaving ? "is-leaving" : ""} ${noTarget ? "no-target" : ""}`} data-login-intro={leaving ? "leaving" : "playing"} aria-hidden="false">
      <div className="intro-sky" />
      <div className="intro-stars" />
      <div className="intro-floor" />
      <div className="intro-horizon" />
      <div className="intro-particles">
        {PARTICLES.map((p, i) => (
          <span key={i} style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }} />
        ))}
      </div>

      <div ref={stageRef} className="intro-stage">
        <svg className="intro-orbit" viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden>
          <ellipse className="trail-blue" cx="300" cy="100" rx="280" ry="80" />
          <ellipse className="trail-violet" cx="300" cy="100" rx="250" ry="66" />
        </svg>
        <div className="intro-glow" />
        <div ref={plateRef} className={`intro-plate ${dark ? "is-clear" : "logo-tile"}`} data-intro-plate={dark ? "clear" : "white"} role="img" aria-label={LOGO_ALT}>
          <img src={dark ? LOGO_TRANSPARENT_SRC : LOGO_SRC} alt="" className="intro-ring-blue" draggable={false} />
          <img src={dark ? LOGO_TRANSPARENT_SRC : LOGO_SRC} alt="" className="intro-ring-violet" draggable={false} />
          <img src={LOGO_SRC} alt="" className="intro-text" draggable={false} />
          <div className="intro-sweep" />
          <div className="intro-flash" />
        </div>
        <div className="intro-reflection" style={{ backgroundImage: `url("${LOGO_SRC}")` }} />
      </div>

      {!leaving && (
        <button type="button" className="intro-skip" onClick={finish} data-intro-skip>
          Passer l'introduction
          <SkipForward className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
