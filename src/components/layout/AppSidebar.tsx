import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  Settings,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Github,
  Bookmark,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useChatActions, useChatConversations } from "@/contexts/ChatContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsModal } from "@/components/features/SettingsModal";
import { LikedMessagesPanel } from "@/components/features/LikedMessagesPanel";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { conversations, currentConversationId } = useChatConversations();
  const {
    createNewConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
  } = useChatActions();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLikedOpen, setIsLikedOpen] = useState(false);

  // Get recent conversations (up to 5 for sidebar display)
  const recentConversations = useMemo(() => conversations.slice(0, 5), [conversations]);

  const handleNewChat = useCallback(async () => {
    await createNewConversation();
    navigate("/chat");
  }, [createNewConversation, navigate]);

  const handleConversationClick = useCallback((conversationId: string) => {
    if (editingId !== conversationId) {
      switchConversation(conversationId);
      if (location.pathname !== "/chat") {
        navigate("/chat");
      }
    }
  }, [editingId, location.pathname, navigate, switchConversation]);

  const handleRenameStart = useCallback((conv: { id: string; title: string }) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (editingId && editingTitle.trim()) {
      await renameConversation(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  }, [editingId, editingTitle, renameConversation]);

  const handleRenameCancel = useCallback(() => {
    setEditingId(null);
    setEditingTitle("");
  }, []);

  const handleDelete = useCallback(async (conversationId: string) => {
    await deleteConversation(conversationId);
  }, [deleteConversation]);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  return (
    <section aria-label="app-sidebar">
      <Sidebar className="border-r border-white/5 bg-gradient-to-b from-bg-100 to-bg-0">
        {/* Header: Logo with glow effect */}
        <SidebarHeader className="px-5 py-6">
          <div className="flex items-center justify-between">
            <Link to="/chat" className="flex items-center gap-3">
              {/* Glowing logo icon */}
              <div className="relative group">
                {/* Subtle outer glow */}
                <div className="absolute -inset-3 bg-gradient-to-r from-[#ff6b35] via-[#ffc107] to-[#ff6b35] rounded-full blur-xl opacity-10 group-hover:opacity-20 transition-all duration-500" />
                {/* Core glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-[#ff6b35] via-[#ff9f43] to-[#ffc107] rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-all duration-300" />
                
                <div className="relative flex h-9 w-9 items-center justify-center">
                  <img 
                    src="/1217198-200.png" 
                    alt="Milkyway AI Logo" 
                    className="h-full w-full object-cover opacity-100 brightness-0 invert drop-shadow-[0_0_2px_rgba(255,255,255,0.3)]" 
                  />
                </div>
              </div>
              {/* Gradient text logo */}
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-orange-200 to-amber-200 bg-clip-text text-transparent">
                Milkyway AI
              </span>
            </Link>
            <SidebarTrigger className="hover:bg-white/5 rounded-lg transition-colors" />
          </div>
        </SidebarHeader>

        <SidebarContent className="px-3 gap-6">
          {/* New Chat Button - Gemini style */}
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  onClick={handleNewChat}
                  className="group/new w-full h-12  px-3 rounded-2xl !bg-transparent hover:!bg-muted cursor-pointer"
                >
                  <div className="flex items-center gap-3 px-1">
                      <Plus className="h-4 w-4 text-purple-200 group-hover/new:text-white transition-colors" />
                    <span className="text-sm font-medium text-foreground/80 group-hover/new:text-foreground transition-colors">
                      새 대화
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Recent Conversations Section */}
          <SidebarGroup className="flex-1 min-h-0">
            <SidebarGroupLabel className="px-3 mb-3 text-sm font-medium text-muted-foreground uppercase tracking-widest">
              최근 대화
            </SidebarGroupLabel>
            <SidebarGroupContent className="h-full overflow-y-auto">
              <SidebarMenu className="gap-1">
                {recentConversations.length > 0 ? (
                  recentConversations.map((conv) => (
                    <SidebarMenuItem key={conv.id} className="group/item">
                      {editingId === conv.id ? (
                        <div className="flex items-center gap-2 px-2 py-1">
                          <Input
                            value={editingTitle}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditingTitle(e.target.value)}
                            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                              if (e.key === "Enter") handleRenameSubmit();
                              if (e.key === "Escape") handleRenameCancel();
                            }}
                            onBlur={handleRenameSubmit}
                            className="h-8 text-sm focus:border-purple-500/30"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="relative flex items-center">
                          <SidebarMenuButton
                            isActive={currentConversationId === conv.id}
                            onClick={() => handleConversationClick(conv.id)}
                            className={`
                              flex-1 h-10 px-3 rounded-xl transition-all duration-200 min-w-0 overflow-hidden
                              ${currentConversationId === conv.id 
                                ? "bg-white/10 text-foreground border border-white/10" 
                                : "!bg-transparent hover:!bg-muted text-foreground/70 hover:text-foreground border border-transparent"
                              }
                            `}
                          >
                            <div className="flex items-center gap-3 min-w-0 w-full">
                              <MessageSquare className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                                currentConversationId === conv.id 
                                  ? "text-orange-400" 
                                  : "text-muted-foreground/50"
                              }`} />
                              <span className="text-sm truncate flex-1 text-left">
                                {conv.title}
                              </span>
                            </div>
                          </SidebarMenuButton>
                          
                          {/* Action Menu - appears on hover */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 h-7 w-7 opacity-0 group-hover/item:opacity-100 transition-all duration-200 shrink-0 rounded-lg hover:bg-white/10"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 bg-bg-200/95 backdrop-blur-xl border-white/10 rounded-xl">
                              <DropdownMenuItem 
                                onClick={() => handleRenameStart(conv)}
                                className="text-sm rounded-lg focus:bg-white/5"
                              >
                                <Pencil className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                                이름 변경
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDelete(conv.id)}
                                className="text-sm rounded-lg text-red-400 focus:text-red-400 focus:bg-red-500/10"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </SidebarMenuItem>
                  ))
                ) : (
                  <div className="px-3 py-6 text-center">
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 mb-3">
                      <MessageSquare className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                    <p className="text-xs text-muted-foreground/50">
                      대화 내역이 없습니다
                    </p>
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
				
          {/* Footer - Settings with subtle divider */}
          <div className="mt-auto pb-4">
            <a
              href="https://github.com/HappyMarmot123"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 mb-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground/80 transition-colors duration-200"
            >
              <Github className="h-3.5 w-3.5 shrink-0" />
              <span>Made by @HappyMarmot123</span>
            </a>
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={() => setIsLikedOpen(true)}
                  className="flex w-full items-center gap-3 h-10 px-3 rounded-xl transition-all duration-200 !bg-transparent hover:!bg-white/5 text-foreground/70 hover:text-foreground"
                >
                  <Bookmark className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-sm font-medium">저장된 응답</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={handleOpenSettings}
                  isActive={location.pathname === "/settings"}
                  className={`
                    flex w-full items-center gap-3
                    h-10 px-3 rounded-xl transition-all duration-200
                    ${location.pathname === "/settings"
                      ? "!bg-white/10 text-foreground"
                      : "!bg-transparent hover:!bg-white/5 text-foreground/70 hover:text-foreground"
                    }
                  `}
                >
                  <Settings className={`h-4 w-4 transition-colors ${
                    location.pathname === "/settings"
                      ? "text-orange-400"
                      : "text-muted-foreground/50"
                  }`} />
                  <span className="text-sm font-medium">설정</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarContent>
      </Sidebar>
      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <LikedMessagesPanel open={isLikedOpen} onOpenChange={setIsLikedOpen} />
    </section>
  );
}
