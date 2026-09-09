import React from "react";

interface IslandCastleLogoProps {
  className?: string;
  size?: number;
}

export const IslandCastleLogo: React.FC<IslandCastleLogoProps> = ({
  className = "w-10 h-10",
  size = 40,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Pacharolo Island Castle Logo"
    >
      <defs>
        <linearGradient id="logoSky" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#020617" />
          <stop offset="45%" stopColor="#0b192c" />
          <stop offset="100%" stopColor="#042f2e" />
        </linearGradient>

        <linearGradient id="logoOcean" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        <linearGradient id="logoSand" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>

        <linearGradient id="logoGrass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>

        <linearGradient id="logoCastle" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="35%" stopColor="#cbd5e1" />
          <stop offset="80%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>

        <linearGradient id="logoRoof" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        <linearGradient id="logoSolana" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14f195" />
          <stop offset="50%" stopColor="#00c2ff" />
          <stop offset="100%" stopColor="#9945ff" />
        </linearGradient>
      </defs>

      {/* App Rounded Frame */}
      <rect width="512" height="512" rx="112" fill="url(#logoSky)" />
      <rect width="512" height="512" rx="112" fill="none" stroke="#1e293b" strokeWidth="6" />

      {/* Stars */}
      <circle cx="80" cy="110" r="3" fill="#38bdf8" opacity="0.8" />
      <circle cx="160" cy="70" r="3.5" fill="#ffffff" opacity="0.9" />
      <circle cx="410" cy="95" r="3" fill="#a7f3d0" opacity="0.8" />
      <circle cx="440" cy="170" r="3.5" fill="#38bdf8" opacity="0.7" />

      {/* Solana Beacon Glow */}
      <circle cx="256" cy="180" r="120" fill="url(#logoSolana)" opacity="0.22" />

      {/* Ocean Waves & Base Water */}
      <path d="M 32 380 Q 140 350 256 370 T 480 380 L 480 480 L 32 480 Z" fill="url(#logoOcean)" />
      <path d="M 40 405 Q 160 385 280 405 T 472 405" fill="none" stroke="#67e8f9" strokeWidth="5" strokeLinecap="round" opacity="0.8" />
      <path d="M 70 435 Q 200 420 330 435 T 450 435" fill="none" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" opacity="0.6" />

      {/* The Island: Rocky Shore & Cliff */}
      <path d="M 75 375 Q 110 395 180 398 Q 256 405 340 396 Q 415 390 437 375 Q 420 345 385 330 Q 320 310 256 312 Q 185 310 125 332 Q 85 350 75 375 Z" fill="url(#logoSand)" />

      {/* The Island: Lush Tropical Hill */}
      <path d="M 95 365 C 120 335 170 320 256 320 C 340 320 390 335 417 365 C 380 382 320 388 256 388 C 190 388 135 382 95 365 Z" fill="url(#logoGrass)" />

      {/* Palm Trees */}
      <g transform="translate(130, 310)">
        <path d="M 12 35 Q 0 10 -10 0" fill="none" stroke="#78350f" strokeWidth="5" strokeLinecap="round" />
        <path d="M -10 0 Q -30 -5 -35 10" fill="none" stroke="#10b981" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M -10 0 Q -15 -25 -5 -30" fill="none" stroke="#34d399" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M -10 0 Q 15 -20 20 -5" fill="none" stroke="#059669" strokeWidth="4.5" strokeLinecap="round" />
      </g>
      <g transform="translate(370, 315)">
        <path d="M -10 30 Q 5 10 12 0" fill="none" stroke="#78350f" strokeWidth="5" strokeLinecap="round" />
        <path d="M 12 0 Q 30 -5 32 10" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
        <path d="M 12 0 Q 15 -20 5 -25" fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" />
        <path d="M 12 0 Q -12 -18 -15 -2" fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* CASTLE */}
      <polygon points="175,325 337,325 325,310 187,310" fill="#475569" />
      <rect x="190" y="240" width="132" height="70" rx="4" fill="url(#logoCastle)" />

      {/* Merlons */}
      <rect x="192" y="230" width="16" height="14" fill="#cbd5e1" />
      <rect x="216" y="230" width="16" height="14" fill="#cbd5e1" />
      <rect x="240" y="230" width="16" height="14" fill="#cbd5e1" />
      <rect x="264" y="230" width="16" height="14" fill="#cbd5e1" />
      <rect x="288" y="230" width="16" height="14" fill="#cbd5e1" />

      {/* Towers */}
      <rect x="170" y="210" width="36" height="100" rx="4" fill="url(#logoCastle)" />
      <polygon points="164,212 212,212 188,165" fill="url(#logoRoof)" />
      <rect x="168" y="208" width="40" height="6" fill="#38bdf8" />
      <rect x="183" y="235" width="10" height="16" rx="5" fill="#0f172a" />

      <rect x="306" y="210" width="36" height="100" rx="4" fill="url(#logoCastle)" />
      <polygon points="300,212 348,212 324,165" fill="url(#logoRoof)" />
      <rect x="304" y="208" width="40" height="6" fill="#38bdf8" />
      <rect x="319" y="235" width="10" height="16" rx="5" fill="#0f172a" />

      {/* Central Great Spire */}
      <rect x="232" y="170" width="48" height="140" rx="4" fill="url(#logoCastle)" />
      <polygon points="224,172 288,172 256,110" fill="url(#logoRoof)" />
      <rect x="228" y="168" width="56" height="6" fill="#14f195" />

      {/* Gate */}
      <path d="M 242 310 L 242 278 Q 256 268 270 278 L 270 310 Z" fill="#090d16" />
      <path d="M 244 280 Q 256 272 268 280" fill="none" stroke="#38bdf8" strokeWidth="2.5" />
      <circle cx="256" cy="285" r="3.5" fill="#14f195" />

      {/* Spire Window */}
      <rect x="249" y="195" width="14" height="22" rx="7" fill="#020617" stroke="#38bdf8" strokeWidth="2" />
      <circle cx="256" cy="204" r="3" fill="#e0f2fe" />

      {/* Flag */}
      <line x1="256" y1="110" x2="256" y2="80" stroke="#cbd5e1" strokeWidth="3.5" strokeLinecap="round" />
      <polygon points="256,82 292,93 256,104" fill="url(#logoSolana)" />

      {/* Orbital Ring */}
      <ellipse cx="256" cy="265" rx="145" ry="38" fill="none" stroke="url(#logoSolana)" strokeWidth="4" strokeDasharray="14 10" opacity="0.75" transform="rotate(-10 256 265)" />
    </svg>
  );
};
