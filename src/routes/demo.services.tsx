import { createFileRoute } from "@tanstack/react-router";
import { ServicesPage } from "@/components/pages/misc";

export const Route = createFileRoute("/demo/services")({
  head: () => ({ meta: [{ title: "الخدمات — أهلًا سفر" }, { name: "description", content: "الخدمات في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "الخدمات — أهلًا سفر" }, { property: "og:description", content: "الخدمات في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ServicesPage,
});
