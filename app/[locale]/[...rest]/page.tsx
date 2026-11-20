import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

/** A not-found page cannot set the tab title itself (Next ignores its metadata here), so the catch-all does. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notFound");
  return { title: t("title") };
}

/** Any unknown address under a language renders that language's not-found page. */
export default function CatchAll() {
  notFound();
}
