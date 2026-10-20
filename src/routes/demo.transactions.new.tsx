import { createFileRoute } from "@tanstack/react-router";
import { NewTransactionPage, TransactionDetailPage } from "@/components/pages/transaction";

export const Route = createFileRoute("/demo/transactions/new")({
  head: () => ({ meta: [{ title: "معاملة جديدة — أهلًا سفر" }, { name: "description", content: "معاملة جديدة في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "معاملة جديدة — أهلًا سفر" }, { property: "og:description", content: "معاملة جديدة في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewTransactionPage,
});
function Detail() { const { id } = Route.useParams() as { id: string }; return <TransactionDetailPage id={id} />; }
void Detail; void NewTransactionPage;
