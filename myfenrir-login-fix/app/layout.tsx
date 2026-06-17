import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MyFenrir — Secure Access",
  description: "Identity-first security for your workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
