import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Guard } from "@/components/guard";

export const Route = createFileRoute("/admin")({
  component: () => (
    <Guard admin>
      <Outlet />
    </Guard>
  ),
});
