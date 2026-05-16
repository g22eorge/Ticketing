import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/repair", "/address", "/company", "/profile"],
        disallow: ["/dashboard", "/jobs", "/clients", "/reports", "/settings", "/technicians", "/intake", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
