import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/pages/misc";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "التقارير — أهلًا سفر" }, { name: "description", content: "التقارير في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "التقارير — أهلًا سفر" }, { property: "og:description", content: "التقارير في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReportsPage,
});
