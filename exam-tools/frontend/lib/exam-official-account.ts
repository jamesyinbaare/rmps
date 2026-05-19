/** Bank-specific account input rules (mirrors backend exam_official_account service). */

/** Canonical bank_name values from the bank directory bulk upload. */
export const ABSA_BANK_NAME_IN_DIRECTORY = "ABSA (GH) LTD";
export const ADB_BANK_NAME_IN_DIRECTORY = "AGRICULTURAL DEVELOPMENT BANK";

const ABSA_BANK_NAME_MARKER = "absa";
const ADB_BANK_NAME_MARKER = "agricultural development bank";

export const ABSA_ACCOUNT_INPUT_LEN = 7;
export const ADB_ACCOUNT_INPUT_LEN = 16;
export const FULL_ACCOUNT_LEN = 13;

export type AccountBankKind = "standard" | "absa" | "adb";

export function resolveBankKind(bankName: string): AccountBankKind {
  const name = bankName.trim().toLowerCase();
  if (name.includes(ABSA_BANK_NAME_MARKER)) return "absa";
  if (name.includes(ADB_BANK_NAME_MARKER)) return "adb";
  return "standard";
}

export function accountInputMaxLength(bankName: string): number {
  const kind = resolveBankKind(bankName);
  if (kind === "absa") return ABSA_ACCOUNT_INPUT_LEN;
  if (kind === "adb") return ADB_ACCOUNT_INPUT_LEN;
  return FULL_ACCOUNT_LEN;
}

/** Max digits allowed in the field (ADB edit may use 13 or 16). */
export function accountInputMaxLengthForEdit(bankName: string): number {
  const kind = resolveBankKind(bankName);
  if (kind === "adb") return ADB_ACCOUNT_INPUT_LEN;
  return accountInputMaxLength(bankName);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeBranchCodeDigits(bankCode: string): string | null {
  const digits = digitsOnly(bankCode);
  if (!digits || digits.length > 6) return null;
  return digits.padStart(6, "0");
}

export function splitAbsaAccountForDisplay(stored13: string, bankCode: string): string {
  const stored = digitsOnly(stored13);
  if (stored.length !== FULL_ACCOUNT_LEN) return stored;
  const prefix = normalizeBranchCodeDigits(bankCode);
  if (!prefix || !stored.startsWith(prefix)) return stored;
  return stored.slice(prefix.length);
}

export function isValidAccountInput(
  value: string,
  bankName: string,
  options?: { forUpdate?: boolean },
): boolean {
  const digits = digitsOnly(value.trim());
  const kind = resolveBankKind(bankName);
  const forUpdate = options?.forUpdate ?? false;

  if (kind === "absa") return digits.length === ABSA_ACCOUNT_INPUT_LEN;
  if (kind === "adb") {
    if (digits.length === ADB_ACCOUNT_INPUT_LEN) return true;
    return forUpdate && digits.length === FULL_ACCOUNT_LEN;
  }
  return digits.length === FULL_ACCOUNT_LEN;
}

export function accountValidationMessage(bankName: string, forUpdate: boolean): string {
  const kind = resolveBankKind(bankName);
  if (kind === "absa") {
    return "ABSA account must be exactly 7 digits.";
  }
  if (kind === "adb") {
    return forUpdate
      ? "ADB account must be 16 digits, or 13 digits to keep the saved number."
      : "ADB account must be exactly 16 digits.";
  }
  return "Account number must be exactly 13 digits.";
}

export type AccountFieldCopy = {
  label: string;
  description: string;
  helper: string;
  targetLen: number;
};

export function getAccountFieldCopy(bankName: string, forUpdate?: boolean): AccountFieldCopy {
  const kind = resolveBankKind(bankName);
  if (kind === "absa") {
    return {
      label: "Account number (7 digits)",
      description: "7-digit account at the selected ABSA branch.",
      helper: "",
      targetLen: ABSA_ACCOUNT_INPUT_LEN,
    };
  }
  if (kind === "adb") {
    return {
      label: forUpdate ? "Account number (16 or 13 digits)" : "Account number (16 digits)",
      description: forUpdate
        ? "Enter 16 digits to replace, or keep the 13-digit saved number."
        : "16-digit account at Agricultural Development Bank.",
      helper: "",
      targetLen: forUpdate ? FULL_ACCOUNT_LEN : ADB_ACCOUNT_INPUT_LEN,
    };
  }
  return {
    label: "Account number (13 digits)",
    description: "13-digit account number at the selected branch.",
    helper: "",
    targetLen: FULL_ACCOUNT_LEN,
  };
}
