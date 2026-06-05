import { db } from "@/lib/db";
import { getDownloadUrl } from "@/lib/s3";

export async function getUserAvatarUrl(userId: string): Promise<string | null> {
  const profile = await db.dealerProfile.findUnique({
    where: { userId },
    select: { avatarKey: true },
  });
  if (!profile?.avatarKey) return null;
  return getDownloadUrl(profile.avatarKey, 3600);
}
