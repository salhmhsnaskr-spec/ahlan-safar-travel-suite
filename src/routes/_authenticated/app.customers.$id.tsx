import { createFileRoute } from "@tanstack/react-router";
import { CustomerDetailPage } from "@/components/pages/customer-detail";

export const Route = createFileRoute("/_authenticated/app/customers/$id")({
  head: () => ({ meta: [{ title: "تفاصيل العميل — أهلًا سفر" }, { name: "description", content: "تفاصيل العميل في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "تفاصيل العميل — أهلًا سفر" }, { property: "og:description", content: "تفاصيل العميل في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});
function Page() { const { id } = Route.useParams(); return <CustomerDetailPage id={id} />; }
