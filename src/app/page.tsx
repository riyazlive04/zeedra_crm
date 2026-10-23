import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const s = await getSession();
  redirect(s ? (s.role === "FIELD_SALES" ? "/field" : s.role === "INSTALLER" ? "/projects" : "/dashboard") : "/login");
}
