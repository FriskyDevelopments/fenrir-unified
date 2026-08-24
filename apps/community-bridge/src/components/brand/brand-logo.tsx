import { useBrand } from "@/config/brand-context";
import { brandInitials, type BrandConfig } from "@/config/brands";

/** Square brand mark — logo file when configured, initials otherwise. */
export function BrandMark({ className }: { className?: string }) {
  const brand = useBrand();
  if (brand.logo.markUrl) {
    return (
      <img
        src={brand.logo.markUrl}
        alt={brand.logo.alt}
        className={["block h-full w-full min-h-8 min-w-8 rounded-[22%] object-contain", className ?? ""].join(" ")}
        loading="eager"
        decoding="async"
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={brand.logo.alt}
      className={[
        "flex items-center justify-center rounded-[22%] bg-primary/15 font-semibold tracking-tight text-primary",
        className ?? "",
      ].join(" ")}
    >
      {brandInitials(brand)}
    </span>
  );
}

/** Horizontal wordmark — logo file when configured, styled text otherwise. */
export function BrandWordmark({ className }: { className?: string }) {
  const brand = useBrand();
  if (brand.logo.wordmarkUrl) {
    return (
      <img
        src={brand.logo.wordmarkUrl}
        alt={`${brand.name} wordmark logo`}
        className={["block h-auto min-h-8 w-full max-w-[14rem] object-contain", className ?? ""].join(" ")}
        decoding="async"
      />
    );
  }
  return (
    <span
      className={[
        "block text-2xl font-semibold uppercase tracking-[0.28em] text-foreground",
        className ?? "",
      ].join(" ")}
    >
      {brand.name}
    </span>
  );
}

/** "Powered by <brand>" badge; links out only when the brand has a site. */
export function BrandBadge({ className }: { className?: string }) {
  const brand: BrandConfig = useBrand();
  const classes = [
    "group inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground transition-all hover:border-ring/40 hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className ?? "",
  ].join(" ");

  const content = (
    <>
      <span className="h-4 w-4 transition-transform group-hover:scale-110">
        <BrandMark className="h-full w-full text-[8px]" />
      </span>
      <span className="font-semibold">Powered by {brand.name}</span>
    </>
  );

  if (!brand.links.site) {
    return (
      <span className={classes} aria-label={`Powered by ${brand.name}`}>
        {content}
      </span>
    );
  }

  return (
    <a
      href={brand.links.site}
      target="_blank"
      rel="noopener noreferrer"
      className={classes}
      aria-label={`Powered by ${brand.name}`}
    >
      {content}
    </a>
  );
}
