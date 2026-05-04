import { getCurrentUserRole } from "@/lib/session";
import { ProfileForm } from "@/components/settings/ProfileForm";

export default async function ProfilePage() {
  const { user } = await getCurrentUserRole();

  return (
    <div className="space-y-4">
      <ProfileForm name={user.name} email={user.email} role={user.role} phone={user.phone} />
    </div>
  );
}
