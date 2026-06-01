"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";

import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  draftIsNoScripts,
  type ScriptControlDraft,
} from "@/lib/script-control-editor";
import {
  noScriptsEnvelope1Hint,
  noScriptsSeriesEditHint,
  packingCountFieldLabel,
} from "@/lib/script-packing-terms";
import { cn } from "@/lib/utils";

const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium hover:bg-muted";
const btnDanger =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive hover:bg-destructive/10";
const stepperBtn =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input-border bg-muted/50 text-foreground hover:bg-muted active:bg-muted/80";

type Props = {
  draft: ScriptControlDraft;
  paperNumber: number;
  recordType: "regular" | "irregular";
  cap: number;
  layout: "table" | "cards";
  autoFocus?: boolean;
  autoFocusDelay?: number;
  onDraftChange: (draft: ScriptControlDraft) => void;
};

export function ScriptControlEnvelopeFields({
  draft,
  paperNumber,
  recordType,
  cap,
  layout,
  autoFocus = false,
  autoFocusDelay = 0,
  onDraftChange,
}: Props) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = window.setTimeout(() => {
      inputRefs.current[0]?.focus();
      inputRefs.current[0]?.select();
    }, autoFocusDelay);
    return () => window.clearTimeout(t);
  }, [autoFocus, autoFocusDelay, draft.envelopes.length]);

  function addEnvelope() {
    if (draftIsNoScripts(draft)) return;
    const next =
      draft.envelopes.length === 0 ? 1 : Math.max(...draft.envelopes.map((e) => e.envelope_number)) + 1;
    onDraftChange({ envelopes: [...draft.envelopes, { envelope_number: next, booklet_count: null }] });
  }

  function removeEnvelope(idx: number) {
    const env = draft.envelopes[idx];
    if (env?.envelope_number === 1 && draft.envelopes.length === 1) return;
    onDraftChange({ envelopes: draft.envelopes.filter((_, i) => i !== idx) });
  }

  function updateEnvelope(idx: number, booklet_count: number | null) {
    const updated = draft.envelopes.map((e, i) => {
      if (i !== idx) return e;
      return { ...e, booklet_count: booklet_count === null ? null : Math.max(0, booklet_count) };
    });
    const env1 = updated.find((e) => e.envelope_number === 1);
    if (env1?.booklet_count === 0) onDraftChange({ envelopes: [env1] });
    else onDraftChange({ envelopes: updated });
  }

  function stepEnvelope(idx: number, delta: number) {
    const env = draft.envelopes[idx];
    if (!env) return;
    const cur = env.booklet_count ?? 0;
    const next = Math.max(0, Math.min(cap, cur + delta));
    updateEnvelope(idx, next);
  }

  function focusNextInput(idx: number) {
    const next = inputRefs.current[idx + 1];
    if (next) {
      next.focus();
      next.select();
    }
  }

  const header = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={formLabelClass}>Envelopes</span>
        <button type="button" className={btnSecondary} disabled={draftIsNoScripts(draft)} onClick={addEnvelope}>
          Add envelope
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Up to {cap} per envelope. {recordType === "regular" ? noScriptsEnvelope1Hint(paperNumber) : ""}
      </p>
    </>
  );

  const noScriptsHint =
    recordType === "regular" && draft.envelopes.some((e) => e.envelope_number === 1 && e.booklet_count === 0) ? (
      <p className="text-sm text-primary">{noScriptsSeriesEditHint(paperNumber)}</p>
    ) : null;

  if (layout === "cards") {
    return (
      <div className="space-y-4">
        {header}
        <ul className="space-y-2">
          {draft.envelopes.map((env, idx) => (
            <li
              key={env.envelope_number}
              className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">Env {env.envelope_number}</span>
                <button
                  type="button"
                  className={stepperBtn}
                  aria-label={`Decrease envelope ${env.envelope_number}`}
                  disabled={draftIsNoScripts(draft)}
                  onClick={() => stepEnvelope(idx, -1)}
                >
                  <Minus className="size-4" />
                </button>
                <input
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="number"
                  min={0}
                  max={cap}
                  inputMode="numeric"
                  enterKeyHint={idx < draft.envelopes.length - 1 ? "next" : "done"}
                  className={cn(formInputClass, "mt-0 min-h-11 flex-1 text-center text-base tabular-nums")}
                  value={env.booklet_count === null ? "" : env.booklet_count}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateEnvelope(idx, v === "" ? null : parseInt(v, 10));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focusNextInput(idx);
                    }
                  }}
                />
                <button
                  type="button"
                  className={stepperBtn}
                  aria-label={`Increase envelope ${env.envelope_number}`}
                  disabled={draftIsNoScripts(draft) || (env.booklet_count ?? 0) >= cap}
                  onClick={() => stepEnvelope(idx, 1)}
                >
                  <Plus className="size-4" />
                </button>
                {env.envelope_number === 1 && draft.envelopes.length === 1 ? (
                  <span className="w-10 shrink-0" aria-hidden />
                ) : (
                  <button
                    type="button"
                    className={cn(btnDanger, "min-h-9 shrink-0 px-2 text-xs")}
                    onClick={() => removeEnvelope(idx)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <p className="mt-1 pl-16 text-[11px] text-muted-foreground">{packingCountFieldLabel(paperNumber)}</p>
            </li>
          ))}
        </ul>
        {noScriptsHint}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[280px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Envelope</th>
              <th className="px-3 py-2 font-medium">{packingCountFieldLabel(paperNumber)}</th>
              <th className="px-3 py-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {draft.envelopes.map((env, idx) => (
              <tr key={env.envelope_number} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2 font-medium tabular-nums">{env.envelope_number}</td>
                <td className="px-3 py-2">
                  <input
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className={cn(formInputClass, "max-w-[140px]")}
                    value={env.booklet_count === null ? "" : env.booklet_count}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateEnvelope(idx, v === "" ? null : parseInt(v, 10));
                    }}
                  />
                </td>
                <td className="px-3 py-2">
                  {env.envelope_number === 1 && draft.envelopes.length === 1 ? null : (
                    <button
                      type="button"
                      className={cn(btnDanger, "min-h-9 px-2 text-xs")}
                      onClick={() => removeEnvelope(idx)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {noScriptsHint}
    </div>
  );
}
