import type { ReactNode } from "react";

type GlowCardProps = {
  as?: "section" | "article" | "div";
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

export function GlowCard({ as: Tag = "section", className = "", children, ...props }: GlowCardProps) {
  return (
    <Tag className={`glow-card ${className}`.trim()} {...props}>
      {children}
    </Tag>
  );
}
