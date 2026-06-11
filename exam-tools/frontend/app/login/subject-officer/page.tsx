import { redirect } from "next/navigation";

/** Legacy URL — subject officers sign in via Staff sign-in. */
export default function SubjectOfficerLoginRedirectPage() {
  redirect("/login/admin");
}
