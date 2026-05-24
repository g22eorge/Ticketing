import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
const ogImage = `${siteUrl}/eagle-info-logo.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Duuka ProMax",
    template: "%s | Duuka ProMax",
  },
  description: "Business management platform for repairs, sales, inventory, finance, documents, and daily operations.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Duuka ProMax",
    description: "Business management platform for repairs, sales, inventory, finance, documents, and daily operations.",
    url: "/",
    siteName: "Duuka ProMax",
    type: "website",
    images: [{ url: ogImage, width: 512, height: 512, alt: "Duuka ProMax" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Duuka ProMax",
    description: "Business management platform for repairs, sales, inventory, finance, documents, and daily operations.",
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
    <html lang="en" className={`h-full antialiased${themeClass ? " " + themeClass : ""}`}>
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
