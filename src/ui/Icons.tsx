// Small inline SVG icons so the UI never depends on reading text (or on emoji fonts).

type IconProps = { size?: number; className?: string };

export function StarIcon({ size = 24, filled = true, className }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.4l1.3-6.5L2.5 9.3l6.6-.8z"
        fill={filled ? '#ffd23f' : 'rgba(255,255,255,0.25)'}
        stroke={filled ? '#b7791f' : 'rgba(255,255,255,0.85)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SpeakerIcon({ size = 28, muted = false }: IconProps & { muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {muted ? (
        <path d="M17 9l5 6M22 9l-5 6" />
      ) : (
        <>
          <path d="M16.5 8.5a5 5 0 010 7" />
          <path d="M19.5 5.5a9 9 0 010 13" />
        </>
      )}
    </svg>
  );
}

export function MusicIcon({ size = 28, off = false }: IconProps & { off?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
      <circle cx="17.5" cy="16" r="2.5" fill="currentColor" />
      {off && <path d="M3 3l18 18" stroke="#ff4d5e" strokeWidth="3" />}
    </svg>
  );
}

export function GearIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  );
}

export function ResetIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function HomeIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z" />
    </svg>
  );
}

export function CloseIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function FullscreenIcon({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
    </svg>
  );
}

export function PlayIcon({ size = 64 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4.5v15a1 1 0 001.5.9l12-7.5a1 1 0 000-1.8l-12-7.5A1 1 0 007 4.5z" fill="currentColor" />
    </svg>
  );
}

export function GamepadIcon({ size = 40, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 32" aria-hidden className={className}>
      <path d="M12 4h24c6 0 10 6 11 14s-1 12-5 12c-3 0-5-3-7-6H13c-2 3-4 6-7 6-4 0-6-4-5-12S6 4 12 4z" fill="currentColor" />
      <path d="M11 12v8M7 16h8" stroke="#1f2937" strokeWidth="3" strokeLinecap="round" />
      <circle cx="35" cy="12" r="2.4" fill="#ffd23f" />
      <circle cx="39.5" cy="16" r="2.4" fill="#ff4d5e" />
      <circle cx="30.5" cy="16" r="2.4" fill="#3b82f6" />
      <circle cx="35" cy="20" r="2.4" fill="#22c55e" />
    </svg>
  );
}

export function KeyboardIcon({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 32" aria-hidden>
      <rect x="2" y="4" width="44" height="24" rx="5" fill="currentColor" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={6 + i * 6.5} y="9" width="4.5" height="4.5" rx="1" fill="#1f2937" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`b${i}`} x={9 + i * 6.5} y="15.5" width="4.5" height="4.5" rx="1" fill="#1f2937" />
      ))}
      <rect x="13" y="22" width="22" height="3.5" rx="1" fill="#1f2937" />
    </svg>
  );
}

export function HandIcon({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M9 2.5a1.5 1.5 0 013 0V11l.4-.1V5.5a1.5 1.5 0 013 0v6l.4.1V7a1.5 1.5 0 013 0v8.5c0 3.6-2.6 6.5-6.2 6.5h-1.2c-2 0-3.8-1-4.9-2.7L3.2 14a1.5 1.5 0 012.4-1.8L9 15.2z" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V5M5 11l7-7 7 7" />
    </svg>
  );
}
