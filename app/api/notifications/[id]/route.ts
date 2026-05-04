import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserRoleOptional } from "@/lib/session";
import { markNotificationAsRead, markAllNotificationsAsRead } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUserRoleOptional();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    
    if (id === "read-all") {
      await markAllNotificationsAsRead(user.id);
      return NextResponse.json({ success: true });
    }

    await markNotificationAsRead(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark notification as read", error);
    return NextResponse.json(
      { error: "Failed to mark as read" },
      { status: 500 }
    );
  }
}
