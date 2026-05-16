import { NextRequest, NextResponse } from "next/server";
import { requireOrgSession } from "@/lib/org-context";
import { markNotificationAsRead, markAllNotificationsAsRead } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await requireOrgSession();

  try {
    const { id } = await params;
    
    if (id === "read-all") {
      await markAllNotificationsAsRead(user.id);
      return NextResponse.json({ success: true });
    }

    await markNotificationAsRead(user.id, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark notification as read", error);
    return NextResponse.json(
      { error: "Failed to mark as read" },
      { status: 500 }
    );
  }
}
