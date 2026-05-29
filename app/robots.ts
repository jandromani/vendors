import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/internal/", "/api/internal/"],
      },
    ],
    sitemap: "https://ai-vendor-compare.vercel.app/sitemap.xml",
  }
}
