import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/components/pages/activity";

export const Route = createFileRoute("/demo/activity")({
  head: () => ({ meta: [{ title: "سجل النشاط التجريبي — أهلًا سفر" }, { name: "description", content: "سجل عمليات المكتب التجريبي المعزول في أهلًا سفر." }, { property: "og:title", content: "سجل النشاط التجريبي — أهلًا سفر" }, { property: "og:description", content: "سجل عمليات المكتب التجريبي المعزول في أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ActivityPage,
});
