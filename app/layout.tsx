import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://care.eagleinfosolutions.com";
const ogImage = `${siteUrl}/eagle-info-logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Eagle Info Solutions — Device Repair in Kampala, Uganda",
    template: "%s | Eagle Info Solutions",
  },
  description:
    "Professional repair for phones, laptops, tablets & software in Kampala, Uganda. Transparent pricing, no-fix-no-fee guarantee, 30-day warranty. Request a repair online.",
  keywords: [
    "device repair Kampala",
    "phone repair Uganda",
    "laptop repair Kampala",
    "Apple repair Uganda",
    "computer repair Kampala",
    "Eagle Info Solutions",
    "screen repair Uganda",
    "software repair Kampala",
  ],
  authors: [{ name: "Eagle Info Solutions SMC Limited", url: "https://eagleinfosolutions.com" }],
  creator: "Eagle Info Solutions SMC Limited",
  publisher: "Eagle Info Solutions SMC Limited",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Eagle Info Solutions — Device Repair in Kampala, Uganda",
    description:
      "Professional repair for phones, laptops & tablets in Kampala. Transparent pricing, no-fix-no-fee, 30-day warranty.",
    url: "/",
    siteName: "Eagle Info Solutions",
    type: "website",
    locale: "en_UG",
    images: [{ url: ogImage, width: 512, height: 512, alt: "Eagle Info Solutions" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Eagle Info Solutions — Device Repair in Kampala",
    description: "Professional repair for phones, laptops & tablets. No-fix-no-fee · 30-day warranty.",
    images: [ogImage],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const stored = cookieStore.get("theme")?.value as string | undefined;
  let initialTheme: "system" | "dark" | "light" = "system";
  if (stored === "dark") initialTheme = "dark";
  else if (stored === "light") initialTheme = "light";

  const themeClass = stored === "dark" ? "theme-blackgold" : stored === "light" ? "light" : "";

  return (
    <html lang="en" className={`${manrope.variable} ${sora.variable} h-full antialiased${themeClass ? " " + themeClass : ""}`}>
      <body className="min-h-full bg-[var(--page-bg)] text-[var(--ink)]">
        <ThemeProvider initialTheme={initialTheme}>
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
