import { createFileRoute } from "@tanstack/react-router";
import { Marketplace } from "@/routes/dashboard/extra";

export const Route = createFileRoute("/dashboard/vpn")({
  component: function VpnPage() {
    return <Marketplace kind="vpn" />;
  },
});
