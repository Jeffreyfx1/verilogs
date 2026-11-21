import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/notices")({ component: () => <CmsPage slug="notices" /> });
