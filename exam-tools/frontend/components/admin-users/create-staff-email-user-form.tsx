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

export type StaffEmailUserCreatePayload = {
  email: string;
  password: string;
  full_name: string;
};

type CreateStaffEmailUserFormProps = {
  defaultFullName: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: StaffEmailUserCreatePayload) => Promise<void>;
  onCancel: () => void;
};

export function CreateStaffEmailUserForm({
  defaultFullName,
  submitting,
  error,
  onSubmit,
  onCancel,
}: CreateStaffEmailUserFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(defaultFullName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      email: email.trim(),
      password,
      full_name: fullName.trim(),
    });
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <label htmlFor="staff-email" className={formLabelClass}>
          Email
        </label>
        <input
          id="staff-email"
          type="email"
          autoComplete="off"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="staff-password" className={formLabelClass}>
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
          id="staff-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <label htmlFor="staff-name" className={formLabelClass}>
          Full name
        </label>
        <input
          id="staff-name"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={formInputClass}
        />
      </div>
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
