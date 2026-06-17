import { memo, useMemo, type CSSProperties } from "react";
import "./StarField.css";

interface StarFieldProps {
  /** Number of falling stars to render. Keep this low for performance. */
  count?: number;
  className?: string;
}

const STAR_COLORS = [
  "#ffffff",
  "#ffd9b3",
  "#ffc107",
  "#ff9f43",
  "#ff6b35",
];

// CSS custom properties consumed by StarField.css for each star.
type StarStyle = CSSProperties & {
  "--star-left": string;
  "--star-size": string;
  "--star-color": string;
  "--star-duration": string;
  "--star-delay": string;
  "--star-opacity": string;
  "--star-drift": string;
};

/**
 * A lightweight, CSS-only falling-stars background.
 *
 * Each star is animated purely with `transform` and `opacity`, which the
 * browser composites on the GPU — there is no JS animation loop and no
 * layout/paint work per frame. The star configuration is generated once and
 * memoized, so re-renders of the parent are essentially free. Honors
 * `prefers-reduced-motion` (see StarField.css).
 */
const StarField = memo(({ count = 28, className = "" }: StarFieldProps) => {
  const stars = useMemo<StarStyle[]>(() => {
    return Array.from({ length: count }, () => ({
      "--star-left": `${Math.random() * 100}%`,
      "--star-size": `${1 + Math.random() * 2.5}px`,
      "--star-color": STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      "--star-duration": `${6 + Math.random() * 8}s`,
      "--star-delay": `${-Math.random() * 12}s`,
      "--star-opacity": `${0.4 + Math.random() * 0.5}`,
      "--star-drift": `${-30 + Math.random() * 60}px`,
    }));
  }, [count]);

  return (
    <div className={`starfield ${className}`} aria-hidden="true">
      {stars.map((style, index) => (
        <span key={index} className="starfield__star" style={style} />
      ))}
    </div>
  );
});

StarField.displayName = "StarField";

export default StarField;
