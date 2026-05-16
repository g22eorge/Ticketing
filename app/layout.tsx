import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
const ogImage = `${siteUrl}/eagle-info-logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Repair Manager",
    template: "%s | Repair Manager",
  },
  description: "Device repair management platform. Track jobs, manage clients, and communicate with technicians.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Repair Manager",
    description: "Device repair management platform.",
    url: "/",
    siteName: "Repair Manager",
    type: "website",
    images: [{ url: ogImage, width: 512, height: 512, alt: "Repair Manager" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Repair Manager",
    description: "Device repair management platform.",
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
        <Analytics />
      </body>
    </html>
  );
}
