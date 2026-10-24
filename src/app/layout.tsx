import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/toast";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", weight: ["600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: `${BRAND.product} — Solar CRM`, template: `%s · ${BRAND.product}` },
  description: `${BRAND.tagline}. Built by ${BRAND.builtBy}.`,
  applicationName: BRAND.product,
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#0b1220", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="min-h-screen font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
