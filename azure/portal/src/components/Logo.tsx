/**
 * Nebula Forge brand mark.
 *
 * A hexagonal "forge crucible" (industrial, geometric) containing a glowing
 * "nebula" core and a single orbiting satellite, in the primary → accent
 * gradient. Designed to read crisply at 16px favicon size and scale to
 * marketing-hero size without losing its silhouette.
 *
 * Each instance generates unique gradient ids so multiple Logos on the same
 * page (nav + footer + hero) don't accidentally share fills.
 */

import { useId } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  /** Hide the spinning orbit dot animation (default: enabled). */
  staticMark?: boolean;
}

export default function Logo({ size = 28, className, staticMark = false }: LogoProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = {
    grad: `nf-grad-${uid}`,
    core: `nf-core-${uid}`,
    glow: `nf-glow-${uid}`,
  };

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Nebula Forge"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        {/* Hexagon body — primary → accent diagonal */}
        <linearGradient id={ids.grad} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0e8ab5" />
          <stop offset="55%"  stopColor="#3a6bcf" />
          <stop offset="100%" stopColor="#6246d6" />
        </linearGradient>
        {/* Nebula core — bright off-white falling into deep cyan */}
        <radialGradient id={ids.core} cx="38%" cy="38%" r="65%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="35%"  stopColor="#cfeefb" stopOpacity="0.9" />
          <stop offset="80%"  stopColor="#0e8ab5" />
          <stop offset="100%" stopColor="#0a4f7a" />
        </radialGradient>
        {/* Soft outer halo */}
        <radialGradient id={ids.glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Outer hexagonal "forge crucible" — slight tilt for energy */}
      <path
        d="M16 2 L27.7 8.75 L27.7 23.25 L16 30 L4.3 23.25 L4.3 8.75 Z"
        fill={`url(#${ids.grad})`}
      />
      {/* Inner bevel highlight */}
      <path
        d="M16 4.3 L25.7 9.9 L25.7 22.1 L16 27.7 L6.3 22.1 L6.3 9.9 Z"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.18"
        strokeWidth="0.6"
      />

      {/* Soft halo behind the core */}
      <circle cx="16" cy="16" r="9" fill={`url(#${ids.glow})`} opacity="0.7" />

      {/* Nebula core */}
      <circle cx="16" cy="16" r="5.4" fill={`url(#${ids.core})`} />

      {/* Single orbital ring (tilted ellipse) */}
      <ellipse
        cx="16" cy="16" rx="10.2" ry="3.2"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.5"
        strokeWidth="0.75"
        transform="rotate(-28 16 16)"
      />

      {/* Orbiting satellite / spark */}
      <g transform="translate(16 16)" style={{ transformOrigin: '0 0' }}>
        <g
          style={
            staticMark
              ? undefined
              : { animation: 'nf-orbit 14s linear infinite', transformOrigin: '0 0' }
          }
        >
          <circle
            cx="0" cy="0" r="1.55"
            fill="#ffffff"
            transform="translate(9 -4.8)"
          />
          <circle
            cx="0" cy="0" r="3.2"
            fill="#ffffff"
            opacity="0.18"
            transform="translate(9 -4.8)"
          />
        </g>
      </g>

      <style>{`
        @keyframes nf-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}
