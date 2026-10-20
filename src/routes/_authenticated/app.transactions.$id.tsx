import { createFileRoute } from "@tanstack/react-router";
import { NewTransactionPage, TransactionDetailPage } from "@/components/pages/transaction";

export const Route = createFileRoute("/_authenticated/app/transactions/$id")({
  head: () => ({ meta: [{ title: "تفاصيل المعاملة — أهلًا سفر" }, { name: "description", content: "تفاصيل المعاملة في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "تفاصيل المعاملة — أهلًا سفر" }, { property: "og:description", content: "تفاصيل المعاملة في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Detail,
});
function Detail() { const { id } = Route.useParams() as { id: string }; return <TransactionDetailPage id={id} />; }
void Detail; void NewTransactionPage;
