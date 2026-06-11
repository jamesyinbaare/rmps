"use client";

import { useState } from "react";

import { generateAccountPassword } from "@/components/admin-users/generate-password";
import {
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export type SubjectOfficerCreatePayload = {
  email: string;
  password: string;
  full_name: string;
  phone_number?: string | null;
  send_sms?: boolean;
};

type CreateSubjectOfficerFormProps = {
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: SubjectOfficerCreatePayload) => Promise<void>;
  onCancel: () => void;
};

export function CreateSubjectOfficerForm({
  submitting,
  error,
  onSubmit,
  onCancel,
}: CreateSubjectOfficerFormProps) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [sendSms, setSendSms] = useState(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      email: email.trim(),
      password,
      full_name: fullName.trim(),
      phone_number: phone.trim() || null,
      send_sms: sendSms,
    });
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <label htmlFor="so-full-name" className={formLabelClass}>
          Full name
        </label>
        <input
          id="so-full-name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <label htmlFor="so-email" className={formLabelClass}>
          Email
        </label>
        <input
          id="so-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <label htmlFor="so-phone" className={formLabelClass}>
          Phone number{" "}
          <span className="font-normal text-muted-foreground">(optional, for SMS)</span>
        </label>
        <input
          id="so-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="so-password" className={formLabelClass}>
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
          id="so-password"
          required
          type="text"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={formInputClass}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sendSms}
          onChange={(e) => setSendSms(e.target.checked)}
          disabled={!phone.trim()}
        />
        Send credentials SMS {phone.trim() ? "" : "(add phone number)"}
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
