import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Guard } from "@/components/guard";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <Guard>
      <Outlet />
    </Guard>
  ),
});
