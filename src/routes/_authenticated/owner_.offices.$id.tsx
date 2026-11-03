import { createFileRoute } from "@tanstack/react-router";
import { OwnerOfficeDetail } from "@/components/pages/owner-office";

export const Route = createFileRoute("/_authenticated/owner_/offices/$id")({
  head: () => ({ meta: [{ title: "تفاصيل مكتب — لوحة المالك — أهلًا سفر" }, { name: "description", content: "تفاصيل نشاط مكتب واحد لمالك منصة أهلًا سفر." }, { property: "og:title", content: "تفاصيل مكتب — أهلًا سفر" }, { property: "og:description", content: "تفاصيل نشاط المكتب لمالك المنصة." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => <OwnerOfficeDetail id={Route.useParams().id} />,
});
