/*
 * Lumen Metrix — SVG Logo Component
 * Ascending light rays icon + wordmark
 */

interface LumenLogoProps {
  variant?: "full" | "icon" | "wordmark";
  className?: string;
  size?: number;
  light?: boolean;
}

export function LumenIcon({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Three ascending bars fanning from bottom-left like light rays */}
      <rect x="4" y="24" width="5" height="14" rx="1.5" fill="#E8913A" transform="rotate(-10 4 24)" opacity="0.7" />
      <rect x="10" y="14" width="5.5" height="22" rx="1.5" fill="#E8913A" transform="rotate(-2 10 14)" opacity="0.85" />
      <rect x="18" y="6" width="6" height="30" rx="1.5" fill="#E8913A" />
      <rect x="26" y="12" width="5.5" height="24" rx="1.5" fill="#C47A2E" transform="rotate(4 26 12)" opacity="0.75" />
      {/* Light accent dot */}
      <circle cx="21" cy="4" r="2" fill="#F5C882" opacity="0.6" />
    </svg>
  );
}

export default function LumenLogo({ variant = "full", className = "", size = 28, light = false }: LumenLogoProps) {
  const textColor = light ? "#FFFFFF" : "#1C1917";
  const subtleColor = light ? "rgba(255,255,255,0.6)" : "#6B7280";

  if (variant === "icon") {
    return <LumenIcon size={size} className={className} />;
  }

  if (variant === "wordmark") {
    return (
      <span className={`inline-flex items-center gap-0.5 ${className}`}>
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: size * 0.6,
            letterSpacing: "0.06em",
            color: textColor,
          }}
        >
          LUMEN
        </span>
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            fontSize: size * 0.6,
            letterSpacing: "0.06em",
            color: subtleColor,
          }}
        >
          METRIX
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LumenIcon size={size} />
      <span className="inline-flex items-baseline gap-1">
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: size * 0.6,
            letterSpacing: "0.06em",
            color: textColor,
            lineHeight: 1,
          }}
        >
          LUMEN
        </span>
        <span
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 400,
            fontSize: size * 0.6,
            letterSpacing: "0.06em",
            color: subtleColor,
            lineHeight: 1,
          }}
        >
          METRIX
        </span>
      </span>
    </span>
  );
}
