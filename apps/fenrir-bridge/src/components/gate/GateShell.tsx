import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

type GateShellProps = {
  brandName: string;
  brandSub?: string;
  logoSrc?: string | null;
  /** Right side of the top bar (language select, invite button, …). */
  topRight?: ReactNode;
  footerLeft?: string;
  footerStatus?: string;
  children: ReactNode;
};

/**
 * Protocol chrome for gate pages: brand lockup top bar + mono footer.
 * Ported from community-gate/frontend/src/components/GateShell.jsx,
 * without react-router/ThemeProvider (plain anchors + props).
 */
export function GateShell({
  brandName,
  brandSub = "Community · Gate",
  logoSrc,
  topRight,
  footerLeft = "FENRIR · PROTOCOL",
  footerStatus = "Status: protocol active",
  children
}: GateShellProps) {
  return (
    <>
      <div className="gate-topbar">
        <a href="/" className="gate-brand-lockup" style={{ textDecoration: "none", color: "inherit" }} data-testid="brand-home-link">
          <BrandMark src={logoSrc} name={brandName} size={30} />
          <div>
            <div className="gate-brand-name">{brandName}</div>
            <div className="gate-brand-sub">{brandSub}</div>
          </div>
        </a>
        {topRight}
      </div>

      {children}

      <footer className="gate-footer" aria-hidden="true">
        <span>{footerLeft}</span>
        <span className="gate-footer-status">{footerStatus}</span>
      </footer>
    </>
  );
}
