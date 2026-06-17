import ChatBot from "@/components/ChatBot";

export function ChatPage() {
  return (
    <main aria-label="chat-page" className="relative flex flex-col h-full">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-bg-0 via-bg-100/50 to-bg-100" />
      </div>

      <section
        aria-label="chat-interface"
        className="relative flex-1 overflow-hidden transition-all duration-300 border-x border-white/5 shadow-[inset_0_0_20px_-10px_rgba(255,107,53,0.05)]"
      >
        <ChatBot />
      </section>
    </main>
  );
}
