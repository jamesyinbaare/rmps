/** Match backend `generate_sheet_id` school segment from `s_code`. */
export function schoolPrefixForSheetId(sCode: string): string {
  const last = sCode.slice(-6).toUpperCase();
  return last.padStart(6, "0");
}
