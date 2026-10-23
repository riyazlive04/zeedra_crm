import { route } from "@/lib/api";
import { db } from "@/lib/db";

export const GET = route(null, async ({ session }) => {
  const [user, unread] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, role: true, phone: true, avatarColor: true, googleEmail: true, organization: { select: { name: true, slug: true } } },
    }),
    db.notification.count({ where: { userId: session.userId, read: false } }),
  ]);
  return { user, unread };
});
