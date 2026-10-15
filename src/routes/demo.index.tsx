import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/pages/dashboard";

export const Route = createFileRoute("/demo/")({
  head: () => ({ meta: [{ title: "لوحة التحكم — أهلًا سفر" }, { name: "description", content: "لوحة التحكم في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "لوحة التحكم — أهلًا سفر" }, { property: "og:description", content: "لوحة التحكم في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DashboardPage,
});
