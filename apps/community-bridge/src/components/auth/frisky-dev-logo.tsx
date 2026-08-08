import heartAsset from "@/assets/frisky-heart-logo.png.asset.json";

export function FriskyDevLogo({ className }: { className?: string }) {
  return (
    <img
      src={heartAsset.url}
      alt="Frisky Dev"
      className={className}
      aria-label="Frisky Dev"
      draggable={false}
    />
  );
}
