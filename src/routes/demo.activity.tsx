import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/components/pages/activity";

export const Route = createFileRoute("/demo/activity")({
  head: () => ({ meta: [{ title: "سجل النشاط — أهلًا سفر" }, { name: "description", content: "سجل النشاط في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "سجل النشاط — أهلًا سفر" }, { property: "og:description", content: "سجل النشاط في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ActivityPage,
});
