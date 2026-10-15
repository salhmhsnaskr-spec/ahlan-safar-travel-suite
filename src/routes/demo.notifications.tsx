import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPage } from "@/components/pages/misc";

export const Route = createFileRoute("/demo/notifications")({
  head: () => ({ meta: [{ title: "الإشعارات — أهلًا سفر" }, { name: "description", content: "الإشعارات في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "الإشعارات — أهلًا سفر" }, { property: "og:description", content: "الإشعارات في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NotificationsPage,
});
