"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  label?: string;
  color?: string;
}

const ProgressRing = React.forwardRef<HTMLDivElement, ProgressRingProps>(
  (
    {
      className,
      value,
      size = 60,
      strokeWidth = 6,
      showLabel = true,
      label,
      color,
      ...props
    },
    ref
  ) => {
    const normalizedValue = Math.min(100, Math.max(0, value));
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (normalizedValue / 100) * circumference;

    const defaultColor = color || "hsl(var(--primary))";

    return (
      <div
        ref={ref}
        className={cn("relative inline-flex items-center justify-center", className)}
        style={{ width: size, height: size }}
        {...props}
      >
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          style={{ width: size, height: size }}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted opacity-20"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={defaultColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-in-out"
            style={{
              stroke: defaultColor,
            }}
          />
        </svg>
        {showLabel && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-semibold text-foreground">
              {label !== undefined ? label : `${Math.round(normalizedValue)}%`}
            </span>
          </div>
        )}
      </div>
    );
  }
);
ProgressRing.displayName = "ProgressRing";

export { ProgressRing };
