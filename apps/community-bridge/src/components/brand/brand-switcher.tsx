import { useState } from "react";
import { Check, ChevronsUpDown, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBrandRegistry } from "@/config/brand-context";
import { brandInitials, type BrandConfig } from "@/config/brands";
import { useAuth } from "@/hooks/use-auth";

function Swatch({ brand }: { brand: BrandConfig }) {
  return brand.logo.markUrl ? (
    <img
      src={brand.logo.markUrl}
      alt=""
      aria-hidden
      className="h-5 w-5 rounded-[22%] object-contain"
    />
  ) : (
    <span
      aria-hidden
      className="flex h-5 w-5 items-center justify-center rounded-[22%] bg-primary/15 text-[9px] font-semibold text-primary"
    >
      {brandInitials(brand)}
    </span>
  );
}

/**
 * Header / login brand switcher + previewer.
 *
 * Visible to staff (admins of multiple brands or groups) and to anyone who
 * explicitly opened a `?brand=` preview link. Switching pins the brand for the
 * session and reflects it in the URL so the link can be shared.
 */
export function BrandSwitcher({ className }: { className?: string }) {
  const { brand, brands, setBrandId } = useBrandRegistry();
  const { isStaff } = useAuth();
  const [open, setOpen] = useState(false);

  const previewParam =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("brand");

  if (brands.length < 2 || (!isStaff && !previewParam)) return null;

  function select(id: string) {
    setBrandId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("brand", id);
      window.history.replaceState(null, "", url.toString());
    }
    setOpen(false);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Switch active brand"
        className={[
          "inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/40",
          className ?? "",
        ].join(" ")}
      >
        <Swatch brand={brand} />
        <span className="max-w-[9rem] truncate">{brand.name}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs">
          <Eye className="h-3.5 w-3.5" /> Preview brand
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {brands.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onSelect={() => select(b.id)}
            className="flex items-center gap-2"
          >
            <Swatch brand={b} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{b.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {b.hosts[0] ?? b.id}
              </span>
            </span>
            {b.id === brand.id ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
