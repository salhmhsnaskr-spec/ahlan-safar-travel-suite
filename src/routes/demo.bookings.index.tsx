import { createFileRoute } from "@tanstack/react-router";
import { BookingsPage } from "@/components/pages/bookings";

export const Route = createFileRoute("/demo/bookings/")({
  head: () => ({ meta: [{ title: "الحجوزات — أهلًا سفر" }, { name: "description", content: "الحجوزات في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "الحجوزات — أهلًا سفر" }, { property: "og:description", content: "الحجوزات في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: BookingsPage,
});
