import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "БАРСМЕД — Входящие сообщения",
  description:
    "Единое окно для переписки с клиентами БАРСМЕД: Telegram, MAX, VK и другие каналы.",
  icons: {
    icon: "/branding/logo-icon.png",
    apple: "/branding/logo-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full overflow-hidden antialiased">
      <body className="flex h-full min-h-0 flex-col overflow-hidden font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
