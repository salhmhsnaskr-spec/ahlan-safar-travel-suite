import { createFileRoute } from "@tanstack/react-router";
import { TasksPage } from "@/components/pages/tasks";

export const Route = createFileRoute("/demo/tasks")({
  head: () => ({ meta: [{ title: "المهام — أهلًا سفر" }, { name: "description", content: "المهام في نظام أهلًا سفر لإدارة مكاتب السفر." }, { property: "og:title", content: "المهام — أهلًا سفر" }, { property: "og:description", content: "المهام في نظام أهلًا سفر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TasksPage,
});

