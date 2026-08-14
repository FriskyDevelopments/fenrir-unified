import type { ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Shared Uiverse-inspired interaction primitives for Community Bridge.
 * These are local, dependency-free patterns: the project controls the motion,
 * reduced-motion behavior, colors, and accessibility rather than loading an
 * opaque third-party widget at runtime.
 */
export function UiverseLift({
  children,
  disabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <motion.div
      whileHover={disabled ? undefined : { y: -2, scale: 1.015 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
    >
      {children}
    </motion.div>
  );
}

export function UiverseSweep({ className = "" }: { className?: string }) {
  return (
    <motion.span
      aria-hidden="true"
      className={`absolute inset-y-0 left-[-40%] w-1/3 -skew-x-12 bg-white/25 blur-md ${className}`}
      animate={{ x: ["-140%", "440%"] }}
      transition={{ duration: 2.7, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
    />
  );
}
