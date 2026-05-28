import { redirect } from "next/navigation";

/**
 * /settings → always land on Profile so a tab is always active in the SettingsShell.
 * All navigation is driven by the pill buttons at the top of the shell.
 */
export default function SettingsIndexPage() {
  redirect("/settings/profile");
}
