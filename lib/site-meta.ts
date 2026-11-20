import type { Metadata } from "next";

/**
 * The tab icon: /favicon.svg, /favicon.ico (48x48) and the apple-touch-icon,
 * all in public/ and drawn in the token colours. Every page gets them through
 * the [locale] layout.
 */
export const SITE_ICONS: NonNullable<Metadata["icons"]> = {
  icon: [
    { url: "/favicon.svg", type: "image/svg+xml" },
    { url: "/favicon.ico", sizes: "48x48" },
  ],
  apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
};

export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://radar.gnamak.ch";
