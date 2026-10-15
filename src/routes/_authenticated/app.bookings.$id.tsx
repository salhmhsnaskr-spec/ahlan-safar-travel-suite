import { createFileRoute } from "@tanstack/react-router";
import { BookingDetailPage } from "@/components/pages/bookings";

export const Route = createFileRoute("/_authenticated/app/bookings/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الحجز — أهلًا سفر" }, { name: "description", content: "تفاصيل الحجز في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "تفاصيل الحجز — أهلًا سفر" }, { property: "og:description", content: "تفاصيل الحجز في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});
function Page() { const { id } = Route.useParams(); return <BookingDetailPage id={id} />; }
