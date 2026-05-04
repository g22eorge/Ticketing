import { redirect } from "next/navigation";

export default function RepairRedirect() {
  // Keep the public link short.
  // Company site is a single-page layout using in-page anchors.
  redirect("https://www.eagleinfosolutions.com/#repair-request");
}
