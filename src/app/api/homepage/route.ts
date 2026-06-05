import { NextResponse } from "next/server";
import { getCompanyContacts, getHomepageContent } from "@/lib/company-settings";

export const runtime = "nodejs";

export async function GET() {
  const [content, contacts] = await Promise.all([getHomepageContent(), getCompanyContacts()]);
  return NextResponse.json({ content, contacts });
}
