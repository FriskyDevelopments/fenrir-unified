export function FenrirSilhouette({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 640 520" role="img" aria-label="Fenrir silhouette">
      <defs>
        <linearGradient id="fenrirFur" x1="120" y1="80" x2="520" y2="480" gradientUnits="userSpaceOnUse">
          <stop stopColor="#050607" />
          <stop offset="0.48" stopColor="#16080c" />
          <stop offset="1" stopColor="#331018" />
        </linearGradient>
        <linearGradient id="fenrirEdge" x1="118" y1="80" x2="530" y2="430" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff1744" stopOpacity="0.88" />
          <stop offset="0.48" stopColor="#f1b75c" stopOpacity="0.55" />
          <stop offset="1" stopColor="#22c7a8" stopOpacity="0.42" />
        </linearGradient>
        <filter id="fenrirShadow" x="-20%" y="-20%" width="140%" height="150%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="34" stdDeviation="24" floodColor="#000000" floodOpacity="0.62" />
          <feDropShadow dx="0" dy="0" stdDeviation="12" floodColor="#ff1744" floodOpacity="0.26" />
        </filter>
      </defs>
      <path className="silhouette-edge" d="M88 390c58-28 92-58 122-112 19-34 27-67 43-108 7-19 20-52 38-98 14 35 24 61 30 78 38-45 83-78 136-102-9 52-14 91-13 118 44 13 76 33 97 62 19 26 25 57 17 94 28 18 45 39 52 64-39-11-77-13-114-6-45 9-83 28-116 58-53 48-116 65-188 50-49-10-84-42-104-98Z" />
      <path d="M106 382c51-29 82-58 111-110 18-33 26-68 42-110 7-17 16-41 29-72 13 40 23 70 31 90 32-46 72-79 119-99-9 44-12 77-8 99 42 12 73 31 92 57 18 24 23 53 15 87 24 14 39 30 47 48-29-9-64-10-105-2-44 8-83 28-118 59-50 45-107 59-172 43-42-11-70-41-83-90Z" fill="url(#fenrirFur)" filter="url(#fenrirShadow)" />
      <path d="M320 183c31-45 65-72 102-83-13 37-18 67-13 90 42 8 72 25 88 50-50-10-94 0-132 32-35 29-73 42-114 39 30-21 53-64 69-128Z" fill="#06070a" opacity="0.82" />
      <path d="M421 236c24-4 43 2 58 17-28-2-50 2-67 13-14 9-28 16-43 20 11-22 28-38 52-50Z" fill="#10070b" />
      <path d="M443 235l42 8-35 15-28-2 21-21Z" fill="#ff334e" opacity="0.94" />
      <path d="M483 250c10 9 18 22 22 38-20-14-41-19-64-15l42-23Z" fill="#050607" opacity="0.9" />
      <path d="M189 370c41 24 86 33 136 26 47-7 90-26 128-56" stroke="url(#fenrirEdge)" strokeWidth="8" strokeLinecap="round" opacity="0.48" />
      <path d="M268 91c15 43 27 77 35 103" stroke="url(#fenrirEdge)" strokeWidth="6" strokeLinecap="round" opacity="0.46" />
    </svg>
  );
}
