"use client";

import Link from "next/link";
import { useState } from "react";

import { generateAccountPassword } from "@/components/admin-users/generate-password";
import {
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import type { AdminDepotRow } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const subLinkClass = "text-sm font-medium text-primary underline-offset-4 hover:underline";

export type DepotKeeperCreatePayload = {
  depot_code: string;
  username: string;
  password: string;
  full_name: string;
};

type CreateDepotKeeperFormProps = {
  depots: AdminDepotRow[];
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: DepotKeeperCreatePayload) => Promise<void>;
  onCancel: () => void;
};

export function CreateDepotKeeperForm({
  depots,
  submitting,
  error,
  onSubmit,
  onCancel,
}: CreateDepotKeeperFormProps) {
  const [depotCode, setDepotCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      depot_code: depotCode.trim(),
      username: username.trim(),
      password,
      full_name: fullName.trim(),
    });
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
      <div>
        <label htmlFor="keeper-depot" className={formLabelClass}>
          Depot
        </label>
        <select
          id="keeper-depot"
          required
          value={depotCode}
          onChange={(e) => setDepotCode(e.target.value)}
          className={formInputClass}
        >
          <option value="">Select depot…</option>
          {depots.map((d) => (
            <option key={d.id} value={d.code}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
        {depots.length === 0 ? (
          <p className="mt-2 text-sm text-destructive">
            No depots yet.{" "}
            <Link href="/dashboard/admin/depots" className={subLinkClass}>
              Create a depot
            </Link>{" "}
            first.
          </p>
        ) : null}
      </div>
      <div>
        <label htmlFor="keeper-user" className={formLabelClass}>
          Username
        </label>
        <input
          id="keeper-user"
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={formInputClass}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="keeper-pass" className={formLabelClass}>
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
          id="keeper-pass"
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
        <label htmlFor="keeper-name" className={formLabelClass}>
          Full name
        </label>
        <input
          id="keeper-name"
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
        <button
          type="submit"
          disabled={submitting || depots.length === 0}
          className={adminUserBtnPrimary}
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
        <button type="button" disabled={submitting} onClick={onCancel} className={adminUserBtnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
