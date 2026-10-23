import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { MarketingHome } from "@/components/marketing/home";

export default async function Home() {
  const s = await getSession();
  if (s) redirect(s.role === "FIELD_SALES" ? "/field" : s.role === "INSTALLER" ? "/projects" : "/dashboard");
  return <MarketingHome />;
}
