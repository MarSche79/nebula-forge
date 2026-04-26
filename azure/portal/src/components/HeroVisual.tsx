/**
 * Interstellar hero visual — pure SVG + CSS animation.
 *
 * Layered, no JS, no canvas:
 *   1. Far parallax starfield (slow drift)
 *   2. Outer glow halo (subtle pulse)
 *   3. Tilted orbital ring system (3 ellipses, different speeds & axes)
 *   4. Mid-distance debris belt (dashed circle)
 *   5. The planet — atmospheric rim + surface gradient + day/night terminator
 *   6. Foreground orbiting satellites (3 dots on the rings)
 *   7. Occasional shooting star streaks
 *   8. HUD-style live readout chip in the centre top
 *
 * Designed for a ~520x520 box; scales fluidly via SVG viewBox. Respects
 * prefers-reduced-motion.
 */

export default function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden>
      <div className="hv-stars hv-stars-far" />
      <div className="hv-stars hv-stars-mid" />
      <div className="hv-stars hv-stars-near" />

      <span className="hv-shoot hv-shoot-1" />
      <span className="hv-shoot hv-shoot-2" />
      <span className="hv-shoot hv-shoot-3" />

      <svg className="hv-svg" viewBox="0 0 520 520" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#0e8ab5" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#6246d6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6246d6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="planet" cx="35%" cy="35%" r="75%">
            <stop offset="0%"  stopColor="#9be3ff" />
            <stop offset="22%" stopColor="#5dc1f0" />
            <stop offset="55%" stopColor="#0e8ab5" />
            <stop offset="100%" stopColor="#072c44" />
          </radialGradient>
          <radialGradient id="atmosphere" cx="50%" cy="50%" r="50%">
            <stop offset="80%"  stopColor="#9be3ff" stopOpacity="0" />
            <stop offset="92%"  stopColor="#9be3ff" stopOpacity="0.50" />
            <stop offset="100%" stopColor="#9be3ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="storm" cx="42%" cy="55%" r="35%">
            <stop offset="0%"  stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="night" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"  stopColor="#000814" stopOpacity="0" />
            <stop offset="55%" stopColor="#000814" stopOpacity="0" />
            <stop offset="78%" stopColor="#000814" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#000814" stopOpacity="0.92" />
          </linearGradient>
          <linearGradient id="ringStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#0e8ab5" stopOpacity="0.05" />
            <stop offset="50%"  stopColor="#9be3ff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#6246d6" stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id="sat" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#ffffff" />
            <stop offset="40%" stopColor="#9be3ff" />
            <stop offset="100%" stopColor="#0e8ab5" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="260" cy="260" r="240" fill="url(#halo)" className="hv-pulse" />

        <g className="hv-spin-slow" style={{ transformOrigin: '260px 260px' }}>
          <circle
            cx="260" cy="260" r="215"
            fill="none"
            stroke="#9be3ff"
            strokeOpacity="0.18"
            strokeWidth="0.6"
            strokeDasharray="2 7"
          />
        </g>

        <g className="hv-spin-fast" style={{ transformOrigin: '260px 260px' }}>
          <ellipse
            cx="260" cy="260" rx="200" ry="60"
            fill="none"
            stroke="url(#ringStroke)"
            strokeWidth="1.2"
            transform="rotate(-18 260 260)"
          />
          <circle cx="460" cy="260" r="3.5" fill="#ffffff">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 260 260"
              to="360 260 260"
              dur="18s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="460" cy="260" r="9" fill="url(#sat)" opacity="0.85">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 260 260"
              to="360 260 260"
              dur="18s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        <g className="hv-spin-medium-rev" style={{ transformOrigin: '260px 260px' }}>
          <ellipse
            cx="260" cy="260" rx="180" ry="42"
            fill="none"
            stroke="url(#ringStroke)"
            strokeWidth="1"
            strokeDasharray="3 4"
            transform="rotate(38 260 260)"
            opacity="0.7"
          />
          <circle cx="440" cy="260" r="2.4" fill="#9be3ff">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="38 260 260"
              to="-322 260 260"
              dur="25s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        <g className="hv-spin-slow" style={{ transformOrigin: '260px 260px' }}>
          <ellipse
            cx="260" cy="260" rx="160" ry="14"
            fill="none"
            stroke="url(#ringStroke)"
            strokeWidth="0.8"
            transform="rotate(72 260 260)"
            opacity="0.55"
          />
          <circle cx="420" cy="260" r="2" fill="#ffffff">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="72 260 260"
              to="432 260 260"
              dur="34s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        <g>
          <circle cx="260" cy="260" r="118" fill="url(#atmosphere)" />
          <circle cx="260" cy="260" r="110" fill="url(#planet)" />
          <circle cx="260" cy="260" r="110" fill="url(#storm)" />
          <circle cx="260" cy="260" r="110" fill="url(#night)" />
          <ellipse cx="260" cy="252" rx="100" ry="6" fill="#ffffff" opacity="0.06" />
          <g opacity="0.55" className="hv-twinkle">
            <circle cx="320" cy="240" r="0.6" fill="#ffd24a" />
            <circle cx="333" cy="262" r="0.5" fill="#ffd24a" />
            <circle cx="318" cy="280" r="0.6" fill="#ff8a3a" />
            <circle cx="345" cy="252" r="0.4" fill="#ffd24a" />
            <circle cx="328" cy="298" r="0.5" fill="#ffd24a" />
          </g>
        </g>

        <g className="hv-hud" transform="translate(260 116)">
          <rect x="-50" y="-14" width="100" height="28" rx="14"
            fill="rgba(8,18,32,0.65)" stroke="#9be3ff" strokeOpacity="0.45" strokeWidth="0.7" />
          <circle cx="-36" cy="0" r="3" fill="#10d9a0" className="hv-blink" />
          <text x="-26" y="3.5" fontSize="9" fontFamily="ui-monospace, monospace"
            fill="#9be3ff" letterSpacing="2">SECTOR&#160;7&#160;LIVE</text>
        </g>
      </svg>

      <style>{`
        .hero-visual {
          position: relative;
          width: 100%;
          max-width: 520px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
          overflow: hidden;
          border-radius: 50%;
        }
        .hv-svg { position: absolute; inset: 0; width: 100%; height: 100%; }

        .hv-stars {
          position: absolute; inset: -20%;
          background-repeat: repeat;
          pointer-events: none;
          opacity: 0.7;
        }
        .hv-stars-far {
          background-image:
            radial-gradient(0.8px 0.8px at 12% 18%, rgba(255,255,255,0.55), transparent 60%),
            radial-gradient(0.6px 0.6px at 78% 32%, rgba(255,255,255,0.50), transparent 60%),
            radial-gradient(0.7px 0.7px at 42% 70%, rgba(255,255,255,0.55), transparent 60%),
            radial-gradient(0.6px 0.6px at 88% 84%, rgba(255,255,255,0.45), transparent 60%),
            radial-gradient(0.5px 0.5px at 22% 92%, rgba(255,255,255,0.40), transparent 60%);
          background-size: 240px 240px;
          animation: hv-drift 90s linear infinite;
        }
        .hv-stars-mid {
          background-image:
            radial-gradient(1px 1px at 30% 12%, rgba(155,227,255,0.65), transparent 60%),
            radial-gradient(1px 1px at 64% 60%, rgba(255,255,255,0.55), transparent 60%),
            radial-gradient(0.8px 0.8px at 14% 50%, rgba(155,227,255,0.40), transparent 60%);
          background-size: 360px 360px;
          animation: hv-drift 60s linear infinite reverse;
        }
        .hv-stars-near {
          background-image:
            radial-gradient(1.4px 1.4px at 50% 28%, rgba(255,255,255,0.85), transparent 60%),
            radial-gradient(1.2px 1.2px at 76% 76%, rgba(255,255,255,0.75), transparent 60%);
          background-size: 480px 480px;
          animation: hv-drift 35s linear infinite;
        }
        @keyframes hv-drift {
          from { transform: translate(0, 0); }
          to   { transform: translate(-200px, -120px); }
        }

        .hv-pulse { transform-origin: center; animation: hv-pulse 6s ease-in-out infinite; }
        @keyframes hv-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.04); }
        }

        .hv-spin-slow        { animation: hv-rot 80s linear infinite; }
        .hv-spin-fast        { animation: hv-rot 22s linear infinite; }
        .hv-spin-medium-rev  { animation: hv-rot 40s linear infinite reverse; }
        @keyframes hv-rot { to { transform: rotate(360deg); } }

        .hv-twinkle { animation: hv-twinkle 3.5s ease-in-out infinite; transform-origin: 260px 260px; }
        @keyframes hv-twinkle {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 0.75; }
        }

        .hv-hud  { animation: hv-hud 8s ease-in-out infinite; }
        @keyframes hv-hud {
          0%, 100% { opacity: 0.2; }
          20%, 60% { opacity: 1; }
        }
        .hv-blink { animation: hv-blink 1.4s ease-in-out infinite; transform-origin: -36px 0px; }
        @keyframes hv-blink {
          0%, 100% { opacity: 1;   transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }

        .hv-shoot {
          position: absolute;
          width: 90px; height: 1.5px;
          background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 60%, rgba(155,227,255,0.6) 100%);
          border-radius: 2px;
          opacity: 0;
          filter: drop-shadow(0 0 6px rgba(155,227,255,0.85));
          pointer-events: none;
        }
        .hv-shoot-1 { top: 12%;  left: -10%; animation: hv-shoot 7s ease-in 1s infinite; }
        .hv-shoot-2 { top: 40%;  left: -10%; animation: hv-shoot 11s ease-in 4s infinite; }
        .hv-shoot-3 { top: 78%;  left: -10%; animation: hv-shoot 9s ease-in 7s infinite; }
        @keyframes hv-shoot {
          0%   { transform: translate(0, 0)        rotate(20deg); opacity: 0; }
          5%   { opacity: 0; }
          15%  { opacity: 1; }
          50%  { opacity: 0.8; }
          70%  { opacity: 0; transform: translate(620px, 220px) rotate(20deg); }
          100% { opacity: 0; transform: translate(620px, 220px) rotate(20deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hv-stars, .hv-pulse, .hv-spin-slow, .hv-spin-fast, .hv-spin-medium-rev,
          .hv-twinkle, .hv-hud, .hv-blink, .hv-shoot {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
