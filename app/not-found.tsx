import "./globals.css";
import { tokenStyle } from "@/lib/design-tokens";
import { SITE_ICONS } from "@/lib/site-meta";

export const metadata = { title: "Seite nicht gefunden / Page not found | AareRadar", icons: SITE_ICONS };

/** Requests outside a language prefix that matched nothing (rare: middleware sends / to /de). */
export default function RootNotFound() {
  return (
    <html lang="de" style={tokenStyle()}>
      <body>
        <main className="wrap main app-frame">
          <h1>Seite nicht gefunden / Page not found</h1>
          <p>
            <a href="/de">Zum Dashboard</a> · <a href="/en">To the dashboard</a>
          </p>
        </main>
      </body>
    </html>
  );
}
