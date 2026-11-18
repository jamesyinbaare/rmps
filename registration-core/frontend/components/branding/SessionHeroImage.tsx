"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getSessionHeroImage } from "@/lib/session-hero-image";

interface SessionHeroImageProps {
  className?: string;
  imageClassName?: string;
  alt?: string;
}

/**
 * Session-stable random CTVET trade photo.
 * Absolute-fill background for the public landing hero (parent must be positioned).
 * Plain img avoids flaky /_next/image failures on local public JPGs.
 */
export function SessionHeroImage({
  className,
  imageClassName,
  alt = "CTVET technical and vocational training",
}: SessionHeroImageProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(getSessionHeroImage());
  }, []);

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden bg-muted", className)}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local public assets; avoid flaky /_next/image
        <img
          src={src}
          alt={alt}
          className={cn(
            "landing-hero-photo h-full w-full object-cover object-center",
            imageClassName
          )}
        />
      ) : null}
    </div>
  );
}
