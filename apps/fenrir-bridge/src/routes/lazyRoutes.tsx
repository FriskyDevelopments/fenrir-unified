import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import type { Copy, Locale } from "../i18n";
import type { FriskyCommissionLink } from "../services/types";
import type { UiCopy } from "../app/uiCopy";

export function RouteFallback() {
  return <div className="boot">Loading Fenrir…</div>;
}

export function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export const LegalPage = lazy(() =>
  import("./legalPage").then((module) => ({ default: module.LegalPage }))
);

export const PublicVaultPage = lazy(() =>
  import("./vaultRoutes").then((module) => ({ default: module.PublicVaultPage }))
);

export const FriskyGhostRoute = lazy(() =>
  import("./publicRoutes").then((module) => ({ default: module.FriskyGhostRoute }))
);

export const FriskyBotOsRoute = lazy(() =>
  import("./publicRoutes").then((module) => ({ default: module.FriskyBotOsRoute }))
);

export const CommunityNeonGateRoute = lazy(() =>
  import("./communityGate").then((module) => ({ default: module.CommunityNeonGateRoute }))
);

export const GoRoutePage = lazy(() =>
  import("./publicRoutes").then((module) => ({ default: module.GoRoutePage }))
);

export const PublicBridgeRoute = lazy(() =>
  import("./publicRoutes").then((module) => ({ default: module.PublicBridgeRoute }))
);

export const PublicRoomRoute = lazy(() =>
  import("./publicRoutes").then((module) => ({ default: module.PublicRoomRoute }))
);

export const AuthGate = lazy(() =>
  import("./authGate").then((module) => ({ default: module.AuthGate }))
);

export const DashboardRoute = lazy(() =>
  import("./DashboardRoute").then((module) => ({ default: module.DashboardRoute }))
);

export type LegalPageProps = {
  c: Copy;
  locale: Locale;
  onLocale: (locale: Locale) => void;
};

export type PublicVaultPageProps = {
  links: import("../app/shared").VaultLink[];
  c: Copy;
  ui: UiCopy;
};

export type PublicSlugRouteProps = {
  slug: string;
  c: Copy;
  ui: UiCopy;
};

export type GhostBotRouteProps = {
  c: Copy;
  ui: UiCopy;
};

export type CommunityGateRouteProps = {
  slug: string;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  c: Copy;
  ui: UiCopy;
};

export type GoRoutePageProps = {
  c: Copy;
  ui: UiCopy;
  slug: string;
  link: FriskyCommissionLink | null;
  onTrack: () => void;
};

export type AuthGateProps = {
  c: Copy;
  locale: Locale;
  onLocale: (locale: Locale) => void;
};

export function renderLazy<P>(Component: ComponentType<P>, props: P) {
  return (
    <LazyRoute>
      <Component {...props} />
    </LazyRoute>
  );
}
