import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

import "./rotating-cta-button.css";

/**
 * Circular CTA badge with a revolving caption and an icon that swaps on
 * hover/focus.
 *
 * Accessibility contract:
 * - `ringText` is decorative and hidden from assistive tech. The button always
 *   announces `label`, which must describe the real action.
 * - The caption angle is computed as 360/length, so any caption length wraps
 *   the circle exactly once instead of being clipped at 18 characters.
 * - Motion, focus and disabled states live in rotating-cta-button.css.
 */

export type RotatingCtaTone = "crimson" | "telegram";

type RotatingCtaBaseProps = {
  /** Announced action. Required — the ring caption is decorative. */
  label: string;
  /** Decorative caption around the ring. Defaults to `label`. */
  ringText?: string;
  /** `crimson` = MyFenrir design system. `telegram` = Telegram brand blue. */
  tone?: RotatingCtaTone;
  /** Diameter in px. */
  size?: number;
  /** Diameter of the inner disc in px. */
  coreSize?: number;
  /** Icon rendered in the inner disc (both the leading and the copy). */
  icon?: React.ReactNode;
  className?: string;
};

type RotatingCtaAnchorProps = RotatingCtaBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    href: string;
  };

type RotatingCtaButtonOnlyProps = RotatingCtaBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

export type RotatingCtaButtonProps = RotatingCtaAnchorProps | RotatingCtaButtonOnlyProps;

export function RotatingCtaButton(props: RotatingCtaButtonProps) {
  const {
    label,
    ringText,
    tone = "crimson",
    size = 100,
    coreSize = 40,
    icon,
    className,
    href,
    ...rest
  } = props as RotatingCtaBaseProps & { href?: string } & Record<string, unknown>;

  const caption = ringText ?? label;
  const characters = React.useMemo(() => Array.from(caption), [caption]);
  // 20deg only fits 18 characters. Deriving the step keeps any caption exact.
  const step = characters.length > 0 ? 360 / characters.length : 0;

  const style = {
    "--rcta-size": `${size}px`,
    "--rcta-core-size": `${coreSize}px`,
    "--rcta-step": `${step}deg`,
  } as React.CSSProperties;

  const glyph = icon ?? <ArrowUpRight size={18} strokeWidth={2.25} aria-hidden="true" />;

  const inner = (
    <>
      {/* Decorative: the ring repeats what `label` already announces. */}
      <span className="rcta__text" aria-hidden="true">
        {characters.map((character, index) => (
          <span key={`${character}-${index}`} style={{ "--index": index } as React.CSSProperties}>
            {character}
          </span>
        ))}
      </span>
      <span className="rcta__core">
        <span className="rcta__icon rcta__icon--lead">{glyph}</span>
        <span className="rcta__icon rcta__icon--copy" aria-hidden="true">
          {glyph}
        </span>
      </span>
    </>
  );

  const shared = {
    className: cn("rcta", className),
    style,
    "data-tone": tone,
    "aria-label": label,
  };

  if (typeof href === "string") {
    const { style: anchorStyle, ...anchorProps } =
      rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;
    const disabled =
      anchorProps["aria-disabled"] === true || anchorProps["aria-disabled"] === "true";
    return (
      <a
        {...shared}
        {...anchorProps}
        style={{ ...anchorStyle, ...shared.style }}
        href={disabled ? undefined : href}
        tabIndex={disabled ? -1 : anchorProps.tabIndex}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          anchorProps.onClick?.(event);
        }}
        onKeyDown={(event) => {
          if (disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          anchorProps.onKeyDown?.(event);
        }}
      >
        {inner}
      </a>
    );
  }

  const { style: buttonStyle, ...buttonProps } =
    rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" {...shared} {...buttonProps} style={{ ...buttonStyle, ...shared.style }}>
      {inner}
    </button>
  );
}

export default RotatingCtaButton;
