import { createFileRoute } from "@tanstack/react-router";
import { UmrahPage } from "@/components/pages/umrah";

export const Route = createFileRoute("/_authenticated/app/umrah")({
  head: () => ({ meta: [{ title: "رحلات العمرة — أهلًا سفر" }, { name: "description", content: "إدارة المعتمرين ورحلات العمرة الجماعية في نظام أهلًا سفر." }, { property: "og:title", content: "رحلات العمرة — أهلًا سفر" }, { property: "og:description", content: "إدارة المعتمرين ورحلات العمرة الجماعية." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { trip?: string; pilgrim?: string } => ({
    trip: typeof s.trip === "string" ? s.trip : undefined,
    pilgrim: typeof s.pilgrim === "string" ? s.pilgrim : undefined,
  }),
  component: UmrahPage,
});
