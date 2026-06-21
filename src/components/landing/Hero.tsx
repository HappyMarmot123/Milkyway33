import { ResponsiveHeroBanner } from "@/components/ui/responsive-hero-banner";
import { LogoLoop, LogoLoopItem } from "@/components/ui/LogoLoop";

const partnerLogos = [
  { name: "OpenAI", url: "https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg" },
  { name: "Anthropic", url: "https://upload.wikimedia.org/wikipedia/commons/7/78/Anthropic_logo.svg" },
  { name: "Google", url: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg" },
  { name: "Meta", url: "https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg" },
  { name: "Microsoft", url: "https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg" },
];

export function Hero() {
  return (
    <section className="relative w-full isolate min-h-[100svh] overflow-hidden">
      <ResponsiveHeroBanner
        title="Intelligent"
        titleLine2="Conversations"
        description="Transform your ideas into reality with Milkyway AI. Experience the most advanced models in one beautiful interface."
        primaryButtonText="Get Started"
        primaryButtonHref="/chat"
      />
      
      {/* Logo Loop at the bottom */}
      <div className="relative z-20 px-4 pt-12 sm:pt-[5rem] sm:pr-[10rem] sm:pl-0">
        <LogoLoop speed={40} direction="left" pauseOnHover>
          {partnerLogos.map((logo) => (
            <LogoLoopItem key={logo.name}>
              <img 
                src={logo.url} 
                alt={logo.name} 
                className="h-6 w-auto invert opacity-60 hover:opacity-100 transition-opacity"
              />
            </LogoLoopItem>
          ))}
        </LogoLoop>
      </div>
      
      {/* Gradient Overlay for smooth transition */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-b from-transparent to-background z-10 pointer-events-none" />
    </section >
  );
}
