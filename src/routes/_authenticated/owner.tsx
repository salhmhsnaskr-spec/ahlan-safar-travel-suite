import { createFileRoute } from "@tanstack/react-router";
import { OwnerDashboard } from "@/components/pages/owner";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({ meta: [{ title: "لوحة مالك المنصة — أهلًا سفر" }, { name: "description", content: "إحصاءات منصة أهلًا سفر لمالك المنصة." }, { property: "og:title", content: "لوحة مالك المنصة — أهلًا سفر" }, { property: "og:description", content: "إحصاءات منصة أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: OwnerDashboard,
});
