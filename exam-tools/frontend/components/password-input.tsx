"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { formInputClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const toggleButtonClass =
  "absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

export type PasswordInputProps = Omit<React.ComponentPropsWithoutRef<"input">, "type"> & {
  /** Native `type` when value is shown (e.g. `text` for passwords, `tel` for phone). */
  revealType?: React.HTMLInputTypeAttribute;
  toggleShowLabel?: string;
  toggleHideLabel?: string;
};

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      className,
      revealType = "text",
      toggleShowLabel,
      toggleHideLabel,
      ...props
    },
    ref,
  ) {
    const [visible, setVisible] = React.useState(false);
    const inputType = visible ? revealType : "password";
    const showLabel = toggleShowLabel ?? "Show password";
    const hideLabel = toggleHideLabel ?? "Hide password";

    return (
      <div className="relative">
        <input
          ref={ref}
          {...props}
          type={inputType}
          className={cn(formInputClass, "pr-11", className)}
        />
        <button
          type="button"
          className={toggleButtonClass}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className="size-4 shrink-0" aria-hidden />
          ) : (
            <Eye className="size-4 shrink-0" aria-hidden />
          )}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
