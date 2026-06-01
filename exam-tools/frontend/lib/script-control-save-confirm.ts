const SESSION_KEY = "script-control-save-confirm-skip";

export function isScriptControlSaveConfirmSkipped(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setScriptControlSaveConfirmSkipped(skip: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (skip) sessionStorage.setItem(SESSION_KEY, "1");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
