import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/bills")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: function RetiredBills() {
    return <Navigate to="/dashboard" />;
  },
});

