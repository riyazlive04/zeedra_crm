import { MarketingPricing } from "@/components/marketing/pricing-page";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Pricing · ${BRAND.product}`, description: `${BRAND.product} plans for rooftop-solar EPCs of every size.` };

export default function PricingPage() {
  return <MarketingPricing />;
}
