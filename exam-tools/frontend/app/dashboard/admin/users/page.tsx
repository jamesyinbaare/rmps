"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  adminCreateDepotKeeper,
  adminListDepots,
  apiJson,
  createTestAdminOfficer,
  type AdminDepotRow,
  type InspectorCreatePayload,
} from "@/lib/api";
import { getMe, type UserMe } from "@/lib/auth";
import {
  formInputClass,
  formLabelClass,
  primaryButtonClass,
} from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const sectionClass = "scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-5";
const subLinkClass = "text-sm font-medium text-primary underline-offset-4 hover:underline";

const btnPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60 ${inputFocusRing}`;

function Modal({
  title,
  titleId,
  children,
  onClose,
  canClose = true,
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
  canClose?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={() => canClose && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40 ${inputFocusRing}`}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);

  const [officerOpen, setOfficerOpen] = useState(false);
  const [officerEmail, setOfficerEmail] = useState("");
  const [officerPassword, setOfficerPassword] = useState("");
  const [officerFullName, setOfficerFullName] = useState("Test Admin officer");
  const [officerFormError, setOfficerFormError] = useState<string | null>(null);
  const [officerSubmitting, setOfficerSubmitting] = useState(false);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspSchoolCode, setInspSchoolCode] = useState("");
  const [inspPhone, setInspPhone] = useState("");
  const [inspFullName, setInspFullName] = useState("");
  const [inspFormError, setInspFormError] = useState<string | null>(null);
  const [inspSubmitting, setInspSubmitting] = useState(false);

  const [keeperOpen, setKeeperOpen] = useState(false);
  const [depots, setDepots] = useState<AdminDepotRow[]>([]);
  const [keeperDepotCode, setKeeperDepotCode] = useState("");
  const [keeperUsername, setKeeperUsername] = useState("");
  const [keeperPassword, setKeeperPassword] = useState("");
  const [keeperFullName, setKeeperFullName] = useState("");
  const [keeperFormError, setKeeperFormError] = useState<string | null>(null);
  const [keeperSubmitting, setKeeperSubmitting] = useState(false);

  const loadDepots = useCallback(async () => {
    try {
      const data = await adminListDepots(0, 500);
      setDepots(data.items);
    } catch {
      setDepots([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        setMe(user);
        if (user.role === "TEST_ADMIN_OFFICER") {
          router.replace("/dashboard/admin/monitoring");
        }
      } catch {
        if (!cancelled) setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    void loadDepots();
  }, [loadDepots]);

  useEffect(() => {
    if (typeof window === "undefined" || me?.role !== "SUPER_ADMIN") return;
    const hash = window.location.hash.slice(1);
    if (hash === "test-admin-officer") setOfficerOpen(true);
    else if (hash === "inspectors") setInspectorOpen(true);
    else if (hash === "depot-keepers") {
      setKeeperOpen(true);
      void loadDepots();
    }
  }, [me?.role, loadDepots]);

  function openOfficerModal() {
    setOfficerEmail("");
    setOfficerPassword("");
    setOfficerFullName("Test Admin officer");
    setOfficerFormError(null);
    setOfficerOpen(true);
  }

  function openInspectorModal() {
    setInspSchoolCode("");
    setInspPhone("");
    setInspFullName("");
    setInspFormError(null);
    setInspectorOpen(true);
  }

  function openKeeperModal() {
    setKeeperDepotCode("");
    setKeeperUsername("");
    setKeeperPassword("");
    setKeeperFullName("");
    setKeeperFormError(null);
    void loadDepots();
    setKeeperOpen(true);
  }

  async function onCreateOfficer(e: React.FormEvent) {
    e.preventDefault();
    setOfficerFormError(null);
    setOfficerSubmitting(true);
    try {
      await createTestAdminOfficer({
        email: officerEmail.trim(),
        password: officerPassword,
        full_name: officerFullName.trim(),
      });
      setOfficerFormError(null);
      setOfficerEmail("");
      setOfficerPassword("");
      setOfficerFullName("Test Admin officer");
      setOfficerOpen(false);
    } catch (err) {
      setOfficerFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setOfficerSubmitting(false);
    }
  }

  async function onCreateInspector(e: React.FormEvent) {
    e.preventDefault();
    setInspFormError(null);
    const sc = inspSchoolCode.trim();
    const pn = inspPhone.trim();
    const fn = inspFullName.trim();
    if (!sc || !pn || !fn) {
      setInspFormError("School code, phone number, and full name are required.");
      return;
    }
    const payload: InspectorCreatePayload = {
      school_code: sc,
      phone_number: pn,
      full_name: fn,
    };
    setInspSubmitting(true);
    try {
      await apiJson("/inspectors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setInspectorOpen(false);
    } catch (err) {
      setInspFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setInspSubmitting(false);
    }
  }

  async function onCreateKeeper(e: React.FormEvent) {
    e.preventDefault();
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
      setKeeperOpen(false);
    } catch (err) {
      setKeeperFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setKeeperSubmitting(false);
    }
  }

  if (me?.role === "TEST_ADMIN_OFFICER") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Users</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Create accounts for inspectors, depot keepers, and test admin officers (read-only worked-scripts monitoring).
          For full lists, search, edits, and bulk upload, use{" "}
          <Link href="/dashboard/admin/inspectors" className={subLinkClass}>
            Inspectors
          </Link>{" "}
          and{" "}
          <Link href="/dashboard/admin/depots" className={subLinkClass}>
            Depots
          </Link>
          .
        </p>
      </div>

      {me?.role === "SUPER_ADMIN" ? (
        <>
          <section id="test-admin-officer" className={sectionClass}>
            <h3 className="text-base font-semibold text-card-foreground">Test admin officer</h3>
            <p className="text-sm text-muted-foreground">
              Email and password to login to the test admin officer dashboard.
            </p>
            <button type="button" onClick={openOfficerModal} className={btnPrimary}>
              Create test admin officer…
            </button>
          </section>

          <section id="inspectors" className={sectionClass}>
            <h3 className="text-base font-semibold text-card-foreground">Inspector</h3>
            <p className="text-sm text-muted-foreground">
              School code and phone number are their credentials.{" "}
              <Link href="/dashboard/admin/inspectors" className={subLinkClass}>
                Inspectors list & bulk upload
              </Link>
            </p>
            <button type="button" onClick={openInspectorModal} className={btnPrimary}>
              Create inspector…
            </button>
          </section>

          <section id="depot-keepers" className={sectionClass}>
            <h3 className="text-base font-semibold text-card-foreground">Depot keeper</h3>
            <p className="text-sm text-muted-foreground">
              Username and password. Requires an existing depot.{" "}
              <Link href="/dashboard/admin/depots" className={subLinkClass}>
                Depots & all keepers
              </Link>
            </p>
            <button type="button" onClick={openKeeperModal} className={btnPrimary}>
              Create depot keeper…
            </button>
          </section>

          {officerOpen ? (
            <Modal
              title="Create test admin officer"
              titleId="modal-officer-title"
              onClose={() => !officerSubmitting && setOfficerOpen(false)}
              canClose={!officerSubmitting}
            >
              <form className="space-y-4" onSubmit={onCreateOfficer}>
                <div>
                  <label htmlFor="officer-email" className={formLabelClass}>
                    Email
                  </label>
                  <input
                    id="officer-email"
                    type="email"
                    autoComplete="off"
                    required
                    value={officerEmail}
                    onChange={(e) => setOfficerEmail(e.target.value)}
                    className={formInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="officer-password" className={formLabelClass}>
                    Password
                  </label>
                  <input
                    id="officer-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={officerPassword}
                    onChange={(e) => setOfficerPassword(e.target.value)}
                    className={formInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="officer-name" className={formLabelClass}>
                    Full name
                  </label>
                  <input
                    id="officer-name"
                    type="text"
                    required
                    value={officerFullName}
                    onChange={(e) => setOfficerFullName(e.target.value)}
                    className={formInputClass}
                  />
                </div>
                {officerFormError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {officerFormError}
                  </p>
                ) : null}
                <button type="submit" disabled={officerSubmitting} className={primaryButtonClass}>
                  {officerSubmitting ? "Creating…" : "Create"}
                </button>
              </form>
            </Modal>
          ) : null}

          {inspectorOpen ? (
            <Modal
              title="Create inspector"
              titleId="modal-inspector-title"
              onClose={() => !inspSubmitting && setInspectorOpen(false)}
              canClose={!inspSubmitting}
            >
              <form className="space-y-4" onSubmit={onCreateInspector}>
                <div>
                  <label htmlFor="insp-school" className={formLabelClass}>
                    School code
                  </label>
                  <input
                    id="insp-school"
                    type="text"
                    required
                    value={inspSchoolCode}
                    onChange={(e) => setInspSchoolCode(e.target.value)}
                    className={formInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="insp-phone" className={formLabelClass}>
                    Phone number
                  </label>
                  <input
                    id="insp-phone"
                    type="text"
                    required
                    value={inspPhone}
                    onChange={(e) => setInspPhone(e.target.value)}
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
                    value={inspFullName}
                    onChange={(e) => setInspFullName(e.target.value)}
                    className={formInputClass}
                  />
                </div>
                {inspFormError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {inspFormError}
                  </p>
                ) : null}
                <button type="submit" disabled={inspSubmitting} className={primaryButtonClass}>
                  {inspSubmitting ? "Creating…" : "Create"}
                </button>
              </form>
            </Modal>
          ) : null}

          {keeperOpen ? (
            <Modal
              title="Create depot keeper"
              titleId="modal-keeper-title"
              onClose={() => !keeperSubmitting && setKeeperOpen(false)}
              canClose={!keeperSubmitting}
            >
              <form className="space-y-4" onSubmit={onCreateKeeper}>
                <div>
                  <label htmlFor="keeper-depot" className={formLabelClass}>
                    Depot
                  </label>
                  <select
                    id="keeper-depot"
                    required
                    value={keeperDepotCode}
                    onChange={(e) => setKeeperDepotCode(e.target.value)}
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
                    value={keeperUsername}
                    onChange={(e) => setKeeperUsername(e.target.value)}
                    className={formInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="keeper-pass" className={formLabelClass}>
                    Password
                  </label>
                  <input
                    id="keeper-pass"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={keeperPassword}
                    onChange={(e) => setKeeperPassword(e.target.value)}
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
                    value={keeperFullName}
                    onChange={(e) => setKeeperFullName(e.target.value)}
                    className={formInputClass}
                  />
                </div>
                {keeperFormError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {keeperFormError}
                  </p>
                ) : null}
                <button type="submit" disabled={keeperSubmitting || depots.length === 0} className={primaryButtonClass}>
                  {keeperSubmitting ? "Creating…" : "Create"}
                </button>
              </form>
            </Modal>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
