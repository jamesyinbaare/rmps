import { redirect } from "next/navigation";

export default function IssuancesRedirectPage() {
  redirect("/results/certificates/issuances");
}
