import { requirePageSession } from "@/lib/auth";
import { orgSettings } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { SolarCalculator } from "@/components/calculator";

export const metadata = { title: "Solar Calculator" };

export default async function CalculatorPage() {
  const session = await requirePageSession();
  const settings = await orgSettings(session.orgId);
  return (
    <div>
      <PageHeader title="Solar Calculator" subtitle="EB bill → system size, PM Surya Ghar subsidy, savings, payback and EMI. Use it live on calls." />
      <SolarCalculator settings={settings} />
    </div>
  );
}
