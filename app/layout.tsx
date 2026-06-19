import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";

import { ThemeProvider } from "@/components/layout/ThemeProvider";
import "./globals.css";

// Inter — industry standard for business SaaS dashboards (Stripe, Linear, Figma).
// Next.js serves it self-hosted with zero layout shift and full subsetting.
// Variable font covers all weights (100–900) in a single ~95 KB download.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Preload only the weights we actually use to keep the WOFF2 small
  weight: ["400", "500", "600", "700", "800", "900"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";
const ogImage = `${siteUrl}/opengraph-image`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Business OS",
    template: "%s | Business OS",
  },
  description: "Business management platform for repairs, sales, inventory, finance, documents, and daily operations.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Business OS",
    description: "Business management platform for repairs, sales, inventory, finance, documents, and daily operations.",
    url: "/",
    siteName: "Business OS",
    type: "website",
    images: [{ url: ogImage, width: 512, height: 512, alt: "Business OS" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Business OS",
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
  // Allow user scaling — required by WCAG 2.1 SC 1.4.4 and iOS accessibility
  viewportFit: "cover",
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
    <html lang="en" className={`${inter.variable} h-full antialiased${themeClass ? " " + themeClass : ""}`} suppressHydrationWarning>
      <body className="min-h-full bg-[var(--page-bg)] text-[var(--ink)]">
        {/* Prevent white flash: apply theme class before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var m=window.matchMedia('(prefers-color-scheme: dark)');var t=document.cookie.match(/theme=(dark|light)/);var dark=t?t[1]==='dark':m.matches;document.documentElement.classList.remove('theme-blackgold','light');if(dark)document.documentElement.classList.add('theme-blackgold');else document.documentElement.classList.add('light');})();`,
          }}
        />
        <ThemeProvider initialTheme={initialTheme}>
          {children}
          <Toaster richColors />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
