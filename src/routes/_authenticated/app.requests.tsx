import { createFileRoute } from "@tanstack/react-router";
import { RequestsPage } from "@/components/pages/requests";

export const Route = createFileRoute("/_authenticated/app/requests")({
  head: () => ({ meta: [{ title: "الطلبات — أهلًا سفر" }, { name: "description", content: "الطلبات في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "الطلبات — أهلًا سفر" }, { property: "og:description", content: "الطلبات في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: RequestsPage,
});
