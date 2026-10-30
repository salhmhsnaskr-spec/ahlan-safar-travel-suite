import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/pages/misc";

export const Route = createFileRoute("/demo/reports")({
  head: () => ({ meta: [{ title: "تقارير الأداء التجريبية — أهلًا سفر" }, { name: "description", content: "تقارير أداء الموظفين في النسخة التجريبية المعزولة لأهلًا سفر." }, { property: "og:title", content: "تقارير الأداء التجريبية — أهلًا سفر" }, { property: "og:description", content: "مؤشرات الموظفين وسجلات الإنجاز في الوضع التجريبي." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReportsPage,
});
