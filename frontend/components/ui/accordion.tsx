"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
}

interface AccordionTriggerProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionContentProps {
  children: React.ReactNode;
  className?: string;
}

interface AccordionContextValue {
  openItems: Set<string>;
  toggleItem: (value: string, closeOthers?: boolean) => void;
  type?: "single" | "multiple";
}

const AccordionContext = React.createContext<AccordionContextValue | undefined>(undefined);
const AccordionItemContext = React.createContext<string | undefined>(undefined);

interface AccordionProps {
  children: React.ReactNode;
  defaultValue?: string;
  type?: "single" | "multiple";
  value?: string | Set<string>;
  onValueChange?: (value: string | undefined | Set<string>) => void;
}

export function Accordion({
  children,
  defaultValue,
  type = "multiple",
  value: controlledValue,
  onValueChange
}: AccordionProps) {
  const [internalOpenItems, setInternalOpenItems] = React.useState<Set<string>>(
    defaultValue ? new Set([defaultValue]) : new Set()
  );

  // Use controlled value if provided, otherwise use internal state
  const openItems = React.useMemo(() => {
    if (controlledValue === undefined) {
      return internalOpenItems;
    }
    if (type === "multiple") {
      // For multiple mode, controlledValue should be a Set<string>
      return controlledValue instanceof Set ? controlledValue : new Set<string>();
    } else {
      // For single mode, controlledValue should be a string | undefined
      return controlledValue ? new Set([controlledValue as string]) : new Set<string>();
    }
  }, [controlledValue, type, internalOpenItems]);

  const toggleItem = React.useCallback((itemValue: string, closeOthers = false) => {
    if (type === "single") {
      // In single mode, close the current item if it's open, otherwise open the new one
      const newValue = openItems.has(itemValue) ? undefined : itemValue;

      if (onValueChange) {
        onValueChange(newValue);
      } else {
        setInternalOpenItems(newValue ? new Set([newValue]) : new Set());
      }
    } else {
      // In multiple mode, toggle the item
      const next = new Set(openItems);
      if (next.has(itemValue)) {
        next.delete(itemValue);
      } else {
        // If closeOthers is true or we're adding an item and others are open (manual click behavior)
        if (closeOthers || (openItems.size > 0 && !closeOthers)) {
          // For manual clicks in multiple mode when we want single-mode behavior
          // This will be handled by closeOthers parameter
        }
        next.add(itemValue);
      }

      // If closeOthers is requested, keep only the toggled item
      const finalSet = closeOthers && next.has(itemValue) ? new Set([itemValue]) : next;

      if (onValueChange) {
        onValueChange(finalSet);
      } else {
        setInternalOpenItems(finalSet);
      }
    }
  }, [type, openItems, onValueChange]);

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem, type }}>
      <div className="space-y-2">{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({ value, children }: AccordionItemProps) {
  return (
    <AccordionItemContext.Provider value={value}>
      <div className="border rounded-md mb-1">{children}</div>
    </AccordionItemContext.Provider>
  );
}

export function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const context = React.useContext(AccordionContext);
  const itemValue = React.useContext(AccordionItemContext);

  if (!context) throw new Error("AccordionTrigger must be used within Accordion");
  if (!itemValue) throw new Error("AccordionTrigger must be used within AccordionItem");

  const isOpen = context.openItems.has(itemValue);

  return (
    <button
      type="button"
      onClick={() => context.toggleItem(itemValue)}
      className={cn(
        "flex w-full items-center justify-between px-4 py-2 text-left font-medium transition-all hover:bg-muted/50 [&[data-state=open]>svg]:rotate-180",
        className
      )}
      data-state={isOpen ? "open" : "closed"}
    >
      {children}
      <ChevronDown className={cn(
        "h-4 w-4 shrink-0 transition-transform duration-200",
        isOpen && "rotate-180"
      )} />
    </button>
  );
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const context = React.useContext(AccordionContext);
  const itemValue = React.useContext(AccordionItemContext);

  if (!context) throw new Error("AccordionContent must be used within Accordion");
  if (!itemValue) throw new Error("AccordionContent must be used within AccordionItem");

  const isOpen = context.openItems.has(itemValue);

  if (!isOpen) return null;

  return (
    <div className={cn("overflow-hidden text-sm transition-all", className)}>
      <div className="px-4 pb-3 pt-1">{children}</div>
    </div>
  );
}
