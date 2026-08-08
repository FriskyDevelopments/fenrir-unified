import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-card/50 px-3.5 py-2 text-base text-foreground shadow-sm transition-all duration-200 outline-none",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground/70",
          "hover:border-ring/30",
          "focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:bg-card/70",
          "aria-[invalid=true]:border-destructive/70 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/25",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/40",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
