import { db } from "@/lib/db";
import { mergeHomepageContent, type HomepageContent } from "@/lib/homepage-content";

export async function getCompanyContacts() {
  const settings = await db.companySettings.findUnique({ where: { id: "singleton" } });
  return {
    phone: settings?.phone ?? "8 (925) 037-46-66",
    email: settings?.email ?? "marat@mmbrussia.ru",
    address: settings?.address ?? "",
  };
}

export async function getHomepageContent(): Promise<HomepageContent> {
  const settings = await db.companySettings.findUnique({ where: { id: "singleton" } });
  return mergeHomepageContent(settings?.homepage);
}
