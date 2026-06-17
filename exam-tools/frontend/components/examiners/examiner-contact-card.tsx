"use client";

import { CheckCircle2, Copy, MessageSquare, MoreHorizontal, Phone, Smartphone } from "lucide-react";
import { useState } from "react";

import { normalizePhoneForTel } from "@/components/examiners/phone-contact";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  phone: string | null | undefined;
  metaLine?: string;
  referenceCode?: string | null;
  statusBadge?: React.ReactNode;
  onInAppSms?: () => void;
  overflowMenu?: React.ReactNode;
  disabled?: boolean;
  className?: string;
};

export function ExaminerContactCard({
  name,
  phone,
  metaLine,
  referenceCode,
  statusBadge,
  onInAppSms,
  overflowMenu,
  disabled = false,
  className,
}: Props) {
  const [messageOpen, setMessageOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const normalizedPhone = normalizePhoneForTel(phone);
  const displayPhone = phone?.trim() || null;

  async function handleCopyPhone() {
    if (!displayPhone) return;
    try {
      await navigator.clipboard.writeText(displayPhone);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 2000);
    }
  }

  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-3.5 shadow-sm",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold leading-snug text-foreground">{name}</h3>
            {referenceCode?.trim() ? (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {referenceCode.trim()}
              </span>
            ) : null}
            {statusBadge}
          </div>
          {metaLine ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{metaLine}</p>
          ) : null}
          {displayPhone ? (
            <p className="mt-1.5 font-mono text-sm tabular-nums text-foreground">{displayPhone}</p>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">No phone on file</p>
          )}
        </div>
        {overflowMenu ? (
          <div className="shrink-0">{overflowMenu}</div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {normalizedPhone ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-11 min-w-[5.5rem] flex-1 gap-1.5 sm:flex-none"
            asChild
            disabled={disabled}
          >
            <a href={`tel:${normalizedPhone}`}>
              <Phone className="size-4" aria-hidden />
              Call
            </a>
          </Button>
        ) : (
          <Button type="button" variant="default" size="sm" className="h-11 flex-1 sm:flex-none" disabled>
            <Phone className="size-4" aria-hidden />
            Call
          </Button>
        )}

        {normalizedPhone ? (
          <Popover open={messageOpen} onOpenChange={setMessageOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 min-w-[5.5rem] flex-1 gap-1.5 sm:flex-none"
                disabled={disabled}
              >
                <MessageSquare className="size-4" aria-hidden />
                Message
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1">
              <a
                href={`sms:${normalizedPhone}`}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-muted"
                onClick={() => setMessageOpen(false)}
              >
                <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                Text on phone
              </a>
              {onInAppSms ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setMessageOpen(false);
                    onInAppSms();
                  }}
                >
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  Send in app
                </button>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-11 flex-1 sm:flex-none" disabled>
            <MessageSquare className="size-4" aria-hidden />
            Message
          </Button>
        )}

        {displayPhone ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 gap-1.5 px-3"
            disabled={disabled}
            onClick={() => void handleCopyPhone()}
            aria-label="Copy phone number"
          >
            {copyState === "copied" ? (
              <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            <span className="sr-only sm:not-sr-only">
              {copyState === "copied" ? "Copied" : copyState === "error" ? "Failed" : "Copy"}
            </span>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** Compact overflow trigger for embedding in contact cards. */
export function ContactCardOverflowTrigger({
  open,
  onOpenChange,
  children,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          disabled={disabled}
          aria-label="More actions"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        {children}
      </PopoverContent>
    </Popover>
  );
}
