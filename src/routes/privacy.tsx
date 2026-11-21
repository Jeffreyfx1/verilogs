import { createFileRoute } from "@tanstack/react-router";
import { CmsPage } from "@/components/cms-page";

export const Route = createFileRoute("/privacy")({ component: () => <CmsPage slug="privacy" /> });
