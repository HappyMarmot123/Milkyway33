import { Github } from "lucide-react";

export function Navbar() {
  return (
    <nav className="fixed top-0 w-full z-50 border-b bg-background/80 backdrop-blur-md animate-in fade-in duration-500">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <span className="font-bold text-xl tracking-tight text-foreground">Milkyway AI</span>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/HappyMarmot123"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          >
            <Github className="h-5 w-5" />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
