import { createFileRoute } from "@tanstack/react-router";
import { CustomersPage } from "@/components/pages/customers";

export const Route = createFileRoute("/_authenticated/app/customers/")({
  head: () => ({ meta: [{ title: "العملاء — أهلًا سفر" }, { name: "description", content: "العملاء في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "العملاء — أهلًا سفر" }, { property: "og:description", content: "العملاء في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CustomersPage,
});
