import { redirect } from "next/navigation";

/** Processed ICMs was a leftover apply/preview clone. Apply Scores is the apply UI. */
export default function ProcessedICMsRedirect() {
  redirect("/scores/data-entry/apply-scores");
}
