import { useState } from "react";

type BrandMarkProps = {
  /** Optional square logo/icon URL. Falls back to initials from `name`. */
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
};

/**
 * BrandMark renders a community/product visual mark: image if provided,
 * otherwise glowing initials block.
 * Ported from community-gate/frontend/src/components/BrandMark.jsx,
 * adapted from a community object to plain props.
 */
export function BrandMark({ src, name, size = 28, className = "" }: BrandMarkProps) {
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

  const initials = (name || "?")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase() || "?";

  const optimizedSrc = src?.includes("imagedelivery.net")
    ? `${src}/w=${size * 2},fit=contain,format=auto`
    : src;

  if (src && !imgError) {
    return (
      <img
        src={optimizedSrc ?? src}
        alt={name}
        className={className}
        style={{
          height: size,
          width: size,
          objectFit: "contain",
          transition: "opacity 300ms",
          filter: "drop-shadow(0 0 8px hsl(var(--gate-glow) / 0.5))",
          opacity: imgLoading ? 0 : 1
        }}
        onLoad={() => setImgLoading(false)}
        onError={() => {
          setImgError(true);
          setImgLoading(false);
        }}
        crossOrigin="anonymous"
        loading="lazy"
        data-testid="brand-mark-image"
      />
    );
  }

  return (
    <span
      className={`font-display ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: size,
        width: size,
        borderRadius: 4,
        fontWeight: 900,
        background: "hsl(var(--gate-accent))",
        color: "hsl(var(--gate-bg))",
        boxShadow: "0 0 14px hsl(var(--gate-glow) / 0.6)",
        fontSize: size * 0.45,
        letterSpacing: "-0.02em"
      }}
      data-testid="brand-mark-initials"
    >
      {initials}
    </span>
  );
}
