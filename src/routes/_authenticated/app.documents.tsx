import { createFileRoute } from "@tanstack/react-router";
import { DocumentsPage } from "@/components/pages/documents";

export const Route = createFileRoute("/_authenticated/app/documents")({
  head: () => ({ meta: [{ title: "المستندات — أهلًا سفر" }, { name: "description", content: "إدارة مستندات المكتب في نظام أهلًا سفر." }, { property: "og:title", content: "المستندات — أهلًا سفر" }, { property: "og:description", content: "جميع مستندات المكتب في مكان واحد." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: DocumentsPage,
});
