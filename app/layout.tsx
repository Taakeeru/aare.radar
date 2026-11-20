/**
 * Root layout: a passthrough. <html> and <body> live in app/[locale]/layout.tsx
 * so `lang` follows the language (next-intl's App Router setup, as in the template).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
