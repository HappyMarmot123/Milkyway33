import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "./AppSidebar";
import { Header } from "./Header";
import { ChatProvider } from "@/contexts/ChatProvider";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <Header />
          <Separator />
          <div aria-label="app-content" className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-muted/30">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatProvider>
  );
}
