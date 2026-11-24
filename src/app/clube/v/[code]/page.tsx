import type { Metadata } from "next";
import { ClubValidate } from "@/components/club-validate";

export const metadata: Metadata = { title: "Prime Club · Validar carteirinha", robots: { index: false, follow: false } };

export default async function ClubValidatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ClubValidate code={code.toUpperCase()} />;
}
