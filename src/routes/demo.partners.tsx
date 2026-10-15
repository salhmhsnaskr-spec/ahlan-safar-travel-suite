import { createFileRoute } from "@tanstack/react-router";
import { PartnersPage } from "@/components/pages/misc";

export const Route = createFileRoute("/demo/partners")({
  head: () => ({ meta: [{ title: "المكاتب الشريكة — أهلًا سفر" }, { name: "description", content: "المكاتب الشريكة في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "المكاتب الشريكة — أهلًا سفر" }, { property: "og:description", content: "المكاتب الشريكة في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PartnersPage,
});
