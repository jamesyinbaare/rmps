"use client";

import { timeInputToApi } from "@/components/cohorts/cohort-schedule-utils";
import { dateInputToIso } from "@/components/examiner-invitations/utils";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

export type InvitationCoordinationDraft = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  venue: string;
};

export function emptyInvitationCoordinationDraft(): InvitationCoordinationDraft {
  return { startDate: "", startTime: "", endTime: "", endDate: "", venue: "" };
}

export function invitationCoordinationToPayload(draft: InvitationCoordinationDraft) {
  const venue = draft.venue.trim();
  return {
    coordination_start_date: dateInputToIso(draft.startDate),
    coordination_start_time: timeInputToApi(draft.startTime),
    coordination_end_date: dateInputToIso(draft.endDate),
    coordination_end_time: timeInputToApi(draft.endTime),
    coordination_venue: venue || null,
  };
}

type Props = {
  draft: InvitationCoordinationDraft;
  onChange: (next: InvitationCoordinationDraft) => void;
  disabled?: boolean;
  idPrefix: string;
  className?: string;
};

export function InvitationCoordinationScheduleFields({
  draft,
  onChange,
  disabled = false,
  idPrefix,
  className,
}: Props) {
  function patch(partial: Partial<InvitationCoordinationDraft>) {
    onChange({ ...draft, ...partial });
  }

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <div>
        <label className={formLabelClass} htmlFor={`${idPrefix}-coord-start-date`}>
          Start date
        </label>
        <input
          id={`${idPrefix}-coord-start-date`}
          type="date"
          className={cn(formInputClass, "mt-1")}
          value={draft.startDate}
          disabled={disabled}
          onChange={(e) => patch({ startDate: e.target.value })}
        />
      </div>
      <div>
        <label className={formLabelClass} htmlFor={`${idPrefix}-coord-start-time`}>
          Start time
        </label>
        <input
          id={`${idPrefix}-coord-start-time`}
          type="time"
          className={cn(formInputClass, "mt-1")}
          value={draft.startTime}
          disabled={disabled}
          onChange={(e) => patch({ startTime: e.target.value })}
        />
      </div>
      <div>
        <label className={formLabelClass} htmlFor={`${idPrefix}-coord-end-date`}>
          End date
        </label>
        <input
          id={`${idPrefix}-coord-end-date`}
          type="date"
          className={cn(formInputClass, "mt-1")}
          value={draft.endDate}
          disabled={disabled}
          onChange={(e) => patch({ endDate: e.target.value })}
        />
      </div>
      <div>
        <label className={formLabelClass} htmlFor={`${idPrefix}-coord-end-time`}>
          End time
        </label>
        <input
          id={`${idPrefix}-coord-end-time`}
          type="time"
          className={cn(formInputClass, "mt-1")}
          value={draft.endTime}
          disabled={disabled}
          onChange={(e) => patch({ endTime: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <label className={formLabelClass} htmlFor={`${idPrefix}-coord-venue`}>
          Venue
        </label>
        <input
          id={`${idPrefix}-coord-venue`}
          type="text"
          className={cn(formInputClass, "mt-1")}
          value={draft.venue}
          disabled={disabled}
          placeholder="e.g. Conference Room, Ghana TVET Service HQ, East Legon"
          onChange={(e) => patch({ venue: e.target.value })}
        />
      </div>
    </div>
  );
}
