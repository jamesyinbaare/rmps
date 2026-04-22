"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  adminCreateDepot,
  adminCreateDepotKeeper,
  adminListDepotKeepers,
  adminListDepots,
  adminUpdateDepot,
  type AdminDepotKeeperRow,
  type AdminDepotRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const PAGE_SIZE = 20;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function Modal({
  title,
  titleId,
  children,
  onClose,
  panelClassName = "max-w-lg",
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg ${panelClassName}`}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted ${inputFocusRing}`}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

const btnPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60 ${inputFocusRing}`;
const btnSecondary = `inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 ${inputFocusRing}`;

export default function AdminDepotsPage() {
  const [depots, setDepots] = useState<AdminDepotRow[]>([]);
  const [depotsTotal, setDepotsTotal] = useState(0);
  const [depotsPage, setDepotsPage] = useState(1);
  const [depotsLoading, setDepotsLoading] = useState(true);
  const [depotsError, setDepotsError] = useState<string | null>(null);

  const [keepers, setKeepers] = useState<AdminDepotKeeperRow[]>([]);
  const [keepersTotal, setKeepersTotal] = useState(0);
  const [keepersPage, setKeepersPage] = useState(1);
  const [keepersLoading, setKeepersLoading] = useState(true);
  const [keepersError, setKeepersError] = useState<string | null>(null);

  const [addDepotOpen, setAddDepotOpen] = useState(false);
  const [newDepotCode, setNewDepotCode] = useState("");
  const [newDepotName, setNewDepotName] = useState("");
  const [depotFormError, setDepotFormError] = useState<string | null>(null);
  const [depotSubmitting, setDepotSubmitting] = useState(false);

  const [editDepot, setEditDepot] = useState<AdminDepotRow | null>(null);
  const [editDepotName, setEditDepotName] = useState("");
  const [editDepotError, setEditDepotError] = useState<string | null>(null);
  const [editDepotBusy, setEditDepotBusy] = useState(false);

  const [addKeeperOpen, setAddKeeperOpen] = useState(false);
  const [keeperDepotCode, setKeeperDepotCode] = useState("");
  const [keeperUsername, setKeeperUsername] = useState("");
  const [keeperPassword, setKeeperPassword] = useState("");
  const [keeperFullName, setKeeperFullName] = useState("");
  const [keeperFormError, setKeeperFormError] = useState<string | null>(null);
  const [keeperSubmitting, setKeeperSubmitting] = useState(false);
  const [allDepotsForSelect, setAllDepotsForSelect] = useState<AdminDepotRow[]>([]);

  const loadDepots = useCallback(async () => {
    setDepotsLoading(true);
    setDepotsError(null);
    const skip = (depotsPage - 1) * PAGE_SIZE;
    try {
      const data = await adminListDepots(skip, PAGE_SIZE);
      setDepots(data.items);
      setDepotsTotal(data.total);
    } catch (e) {
      setDepotsError(e instanceof Error ? e.message : "Failed to load depots");
      setDepots([]);
      setDepotsTotal(0);
    } finally {
      setDepotsLoading(false);
    }
  }, [depotsPage]);

  const loadKeepers = useCallback(async () => {
    setKeepersLoading(true);
    setKeepersError(null);
    const skip = (keepersPage - 1) * PAGE_SIZE;
    try {
      const data = await adminListDepotKeepers(skip, PAGE_SIZE);
      setKeepers(data.items);
      setKeepersTotal(data.total);
    } catch (e) {
      setKeepersError(e instanceof Error ? e.message : "Failed to load depot keepers");
      setKeepers([]);
      setKeepersTotal(0);
    } finally {
      setKeepersLoading(false);
    }
  }, [keepersPage]);

  useEffect(() => {
    void loadDepots();
  }, [loadDepots]);

  useEffect(() => {
    void loadKeepers();
  }, [loadKeepers]);

  async function loadDepotsForSelect() {
    try {
      const data = await adminListDepots(0, 500);
      setAllDepotsForSelect(data.items);
    } catch {
      setAllDepotsForSelect([]);
    }
  }

  function openAddDepot() {
    setNewDepotCode("");
    setNewDepotName("");
    setDepotFormError(null);
    setAddDepotOpen(true);
  }

  async function submitAddDepot() {
    setDepotFormError(null);
    const code = newDepotCode.trim();
    const name = newDepotName.trim();
    if (!code || !name) {
      setDepotFormError("Code and name are required.");
      return;
    }
    setDepotSubmitting(true);
    try {
      await adminCreateDepot({ code, name });
      setAddDepotOpen(false);
      await loadDepots();
    } catch (e) {
      setDepotFormError(e instanceof Error ? e.message : "Could not create depot");
    } finally {
      setDepotSubmitting(false);
    }
  }

  function openEditDepot(row: AdminDepotRow) {
    setEditDepot(row);
    setEditDepotName(row.name);
    setEditDepotError(null);
  }

  async function submitEditDepot() {
    if (!editDepot) return;
    setEditDepotError(null);
    const name = editDepotName.trim();
    if (!name) {
      setEditDepotError("Name is required.");
      return;
    }
    setEditDepotBusy(true);
    try {
      await adminUpdateDepot(editDepot.id, { name });
      setEditDepot(null);
      await loadDepots();
      await loadKeepers();
    } catch (e) {
      setEditDepotError(e instanceof Error ? e.message : "Could not update depot");
    } finally {
      setEditDepotBusy(false);
    }
  }

  function openAddKeeper() {
    setKeeperDepotCode("");
    setKeeperUsername("");
    setKeeperPassword("");
    setKeeperFullName("");
    setKeeperFormError(null);
    void loadDepotsForSelect();
    setAddKeeperOpen(true);
  }

  async function submitAddKeeper() {
    setKeeperFormError(null);
    const dc = keeperDepotCode.trim();
    const un = keeperUsername.trim();
    const pw = keeperPassword;
    const fn = keeperFullName.trim();
    if (!dc || !un || !pw || !fn) {
      setKeeperFormError("Depot, username, password, and full name are required.");
      return;
    }
    if (pw.length < 8) {
      setKeeperFormError("Password must be at least 8 characters.");
      return;
    }
    setKeeperSubmitting(true);
    try {
      await adminCreateDepotKeeper({
        depot_code: dc,
        username: un,
        password: pw,
        full_name: fn,
      });
      setAddKeeperOpen(false);
      await loadKeepers();
    } catch (e) {
      setKeeperFormError(e instanceof Error ? e.message : "Could not create depot keeper");
    } finally {
      setKeeperSubmitting(false);
    }
  }

  const depotsPages = Math.max(1, Math.ceil(depotsTotal / PAGE_SIZE));
  const keepersPages = Math.max(1, Math.ceil(keepersTotal / PAGE_SIZE));

  return (
    <div className="space-y-12">
      <section className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Depots</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Group schools for depot keeper confirmation workflows. Assign schools on the Schools page
              (depot field).
            </p>
          </div>
          <button type="button" onClick={openAddDepot} className={btnPrimary}>
            Add depot
          </button>
        </div>

        {depotsError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {depotsError}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Updated</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {depotsLoading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : depots.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    No depots yet. Create one to assign schools and depot keepers.
                  </td>
                </tr>
              ) : (
                depots.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 font-mono text-xs">{row.code}</td>
                    <td className="px-3 py-3 font-medium text-foreground">{row.name}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className={`text-sm font-medium text-primary hover:underline ${inputFocusRing} rounded`}
                        onClick={() => openEditDepot(row)}
                      >
                        Edit name
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {depotsPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {depotsPage} of {depotsPages} · {depotsTotal} depot{depotsTotal === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={depotsPage <= 1 || depotsLoading}
                onClick={() => setDepotsPage((p) => p - 1)}
                className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={depotsPage >= depotsPages || depotsLoading}
                onClick={() => setDepotsPage((p) => p + 1)}
                className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-6 border-t border-border pt-12">
        <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Create depot keeper accounts together with inspectors and test admin officers on the{" "}
          <Link href="/dashboard/admin/users#depot-keepers" className="font-medium text-primary hover:underline">
            Users
          </Link>{" "}
          page, or use the button below for this list.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Depot keepers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Assign a unique username and initial password; the user signs in at the depot keeper login page.
              Create depots first.
            </p>
          </div>
          <button type="button" onClick={openAddKeeper} className={btnPrimary}>
            Add depot keeper
          </button>
        </div>

        {keepersError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {keepersError}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-medium">Depot</th>
                <th className="px-3 py-3 font-medium">Full name</th>
                <th className="px-3 py-3 font-medium">Username</th>
              </tr>
            </thead>
            <tbody>
              {keepersLoading ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : keepers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    No depot keepers yet.
                  </td>
                </tr>
              ) : (
                keepers.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3">
                      <span className="font-medium text-foreground">{row.depot_name}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{row.depot_code}</span>
                    </td>
                    <td className="px-3 py-3">{row.full_name}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.username ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {keepersPages > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page {keepersPage} of {keepersPages} · {keepersTotal} depot keeper
              {keepersTotal === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={keepersPage <= 1 || keepersLoading}
                onClick={() => setKeepersPage((p) => p - 1)}
                className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={keepersPage >= keepersPages || keepersLoading}
                onClick={() => setKeepersPage((p) => p + 1)}
                className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {addDepotOpen ? (
        <Modal
          title="Add depot"
          titleId="add-depot-title"
          onClose={() => !depotSubmitting && setAddDepotOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="new-depot-code" className={formLabelClass}>
                Code
              </label>
              <input
                id="new-depot-code"
                className={formInputClass}
                value={newDepotCode}
                onChange={(e) => setNewDepotCode(e.target.value)}
                placeholder="Short unique code"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="new-depot-name" className={formLabelClass}>
                Name
              </label>
              <input
                id="new-depot-name"
                className={formInputClass}
                value={newDepotName}
                onChange={(e) => setNewDepotName(e.target.value)}
                placeholder="Depot display name"
              />
            </div>
            {depotFormError ? (
              <p className="text-sm text-destructive" role="alert">
                {depotFormError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={depotSubmitting} onClick={submitAddDepot} className={btnPrimary}>
                {depotSubmitting ? "Saving…" : "Create depot"}
              </button>
              <button
                type="button"
                disabled={depotSubmitting}
                onClick={() => setAddDepotOpen(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {editDepot ? (
        <Modal
          title="Edit depot name"
          titleId="edit-depot-title"
          onClose={() => !editDepotBusy && setEditDepot(null)}
        >
          <p className="text-sm text-muted-foreground">
            Code <span className="font-mono text-foreground">{editDepot.code}</span> cannot be changed.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="edit-depot-name" className={formLabelClass}>
                Name
              </label>
              <input
                id="edit-depot-name"
                className={formInputClass}
                value={editDepotName}
                onChange={(e) => setEditDepotName(e.target.value)}
              />
            </div>
            {editDepotError ? (
              <p className="text-sm text-destructive" role="alert">
                {editDepotError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={editDepotBusy} onClick={submitEditDepot} className={btnPrimary}>
                {editDepotBusy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={editDepotBusy}
                onClick={() => setEditDepot(null)}
                className={btnSecondary}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {addKeeperOpen ? (
        <Modal
          title="Add depot keeper"
          titleId="add-keeper-title"
          onClose={() => !keeperSubmitting && setAddKeeperOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="keeper-depot" className={formLabelClass}>
                Depot
              </label>
              <select
                id="keeper-depot"
                className={formInputClass}
                value={keeperDepotCode}
                onChange={(e) => setKeeperDepotCode(e.target.value)}
              >
                <option value="">Select depot…</option>
                {allDepotsForSelect.map((d) => (
                  <option key={d.id} value={d.code}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                If the list is empty, create a depot above first (up to 500 depots loaded for this list).
              </p>
            </div>
            <div>
              <label htmlFor="keeper-username" className={formLabelClass}>
                Username
              </label>
              <input
                id="keeper-username"
                className={formInputClass}
                value={keeperUsername}
                onChange={(e) => setKeeperUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="keeper-password" className={formLabelClass}>
                Initial password
              </label>
              <input
                id="keeper-password"
                type="password"
                className={formInputClass}
                value={keeperPassword}
                onChange={(e) => setKeeperPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-muted-foreground">Minimum 8 characters. Share this with the user securely.</p>
            </div>
            <div>
              <label htmlFor="keeper-name" className={formLabelClass}>
                Full name
              </label>
              <input
                id="keeper-name"
                className={formInputClass}
                value={keeperFullName}
                onChange={(e) => setKeeperFullName(e.target.value)}
              />
            </div>
            {keeperFormError ? (
              <p className="text-sm text-destructive" role="alert">
                {keeperFormError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={keeperSubmitting} onClick={submitAddKeeper} className={btnPrimary}>
                {keeperSubmitting ? "Saving…" : "Create depot keeper"}
              </button>
              <button
                type="button"
                disabled={keeperSubmitting}
                onClick={() => setAddKeeperOpen(false)}
                className={btnSecondary}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
