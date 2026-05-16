import { redirect } from "next/navigation";

export default function RepairRedirect() {
  const siteUrl = process.env.NEXT_PUBLIC_COMPANY_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "/";
  redirect(`${siteUrl}/#repair-request`);
}
