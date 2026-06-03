"use client";

import { useEffect, useState } from "react";

import { generateAccountPassword } from "@/components/admin-users/generate-password";
import {
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import { apiJson, type Examination, type InspectorCreatePayload } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type CreateInspectorFormProps = {
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: InspectorCreatePayload) => Promise<void>;
  onCancel: () => void;
};

export function CreateInspectorForm({
  submitting,
  error,
  onSubmit,
  onCancel,
}: CreateInspectorFormProps) {
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [examId, setExamId] = useState<number | "">("");
  const [core, setCore] = useState("");
  const [elective, setElective] = useState("");
  const [exams, setExams] = useState<Examination[]>([]);
  const [sendSms, setSendSms] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (!cancelled) {
          setExams(list);
          setExamId((prev) => (prev !== "" ? prev : list.length ? list[0].id : ""));
        }
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pn = phone.trim();
    const fn = fullName.trim();
    const pw = password;
    if (!pn || !fn || !pw) return;
    const c = core.trim();
    const el = elective.trim();
    const payload: InspectorCreatePayload = {
      phone_number: pn,
      full_name: fn,
      password: pw,
      send_sms: sendSms,
    };
    if (examId !== "") {
      payload.examination_id = examId;
      if (c) payload.core = c;
      if (el) payload.elective = el;
    }
    await onSubmit(payload);
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <label htmlFor="insp-phone" className={formLabelClass}>
          Phone number
        </label>
        <input
          id="insp-phone"
          type="text"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <label htmlFor="insp-name" className={formLabelClass}>
          Full name
        </label>
        <input
          id="insp-name"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="insp-password" className={formLabelClass}>
            Password
          </label>
          <button
            type="button"
            className={`text-sm font-medium text-primary hover:underline ${inputFocusRing}`}
            onClick={() => setPassword(generateAccountPassword())}
          >
            Generate password
          </button>
        </div>
        <input
          id="insp-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={formInputClass}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label htmlFor="insp-exam" className={formLabelClass}>
          Examination (optional postings)
        </label>
        <select
          id="insp-exam"
          className={formInputClass}
          value={examId === "" ? "" : String(examId)}
          onChange={(e) => {
            const v = e.target.value;
            setExamId(v === "" ? "" : parseInt(v, 10));
          }}
        >
          <option value="">No postings — assign later</option>
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.year} {ex.exam_type}
              {ex.exam_series ? ` (${ex.exam_series})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="insp-core" className={formLabelClass}>
          Core centre code
        </label>
        <input
          id="insp-core"
          type="text"
          value={core}
          onChange={(e) => setCore(e.target.value)}
          className={formInputClass}
          placeholder="Host centre code (optional)"
        />
      </div>
      <div>
        <label htmlFor="insp-elective" className={formLabelClass}>
          Elective centre code
        </label>
        <input
          id="insp-elective"
          type="text"
          value={elective}
          onChange={(e) => setElective(e.target.value)}
          className={formInputClass}
          placeholder="Host centre code (optional)"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={sendSms}
          onChange={(e) => setSendSms(e.target.checked)}
          className="size-4 rounded border-input-border"
        />
        Send login details by SMS
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-2">
        <button type="submit" disabled={submitting} className={adminUserBtnPrimary}>
          {submitting ? "Creating…" : "Create account"}
        </button>
        <button type="button" disabled={submitting} onClick={onCancel} className={adminUserBtnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
