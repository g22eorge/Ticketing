import { redirect } from "next/navigation";

export default function CompanyRedirect() {
  redirect(process.env.NEXT_PUBLIC_COMPANY_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "/");
}
