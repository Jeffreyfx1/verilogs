import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AppBoot } from "@/components/app-boot";
import { DeviceFrame } from "@/components/device-picker";
import { SupportBot } from "@/components/support-bot";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  headers: () => ({ "cache-control": "no-cache" }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "VeriLogs — SMS numbers, data and bills" },
      { name: "description", content: "Virtual numbers for SMS verification, data, airtime and bills in naira. Fund a wallet, pick a server, and get a code." },
      { name: "theme-color", content: "#0e071c" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <DeviceFrame>
            <AppBoot>
              <Outlet />
              <SupportBot />
            </AppBoot>
          </DeviceFrame>
          <Toaster position="top-center" />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
