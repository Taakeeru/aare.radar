import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomeView } from "@/components/home-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("title") };
}

/**
 * The start page (21.11.2026, Isabella's brief): the Swiss IT job market at a glance, and a list of every IT job.
 * No job chosen: the market (federal statistics with an estimate for the next quarter, all IT ads, the jobs most
 * open to beginners, skills, companies). A job chosen (?job=<code>): its open ads, weekly demand, required skills
 * (most asked first) and the companies hiring. The three-role view lives on /nachfrage.
 */

export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ job?: string | string[] }> }) {
  return <HomeView params={params} searchParams={searchParams} />;
}
