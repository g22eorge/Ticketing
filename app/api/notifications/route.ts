import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserRoleOptional } from "@/lib/session";
import { getUnreadNotifications, getAllNotifications, getUnreadCount } from "@/lib/notifications";
import { can } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const { user } = await getCurrentUserRoleOptional();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can.viewNotifications(user)) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const searchParams = request.nextUrl.searchParams;
  const all = searchParams.get("all") === "true";
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    const notifications = all
      ? await getAllNotifications(user.id, limit)
      : await getUnreadNotifications(user.id, limit);
    const unreadCount = await getUnreadCount(user.id);

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        ...n,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      })),
      unreadCount,
    });
  } catch (error) {
    console.error("Failed to fetch notifications", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
