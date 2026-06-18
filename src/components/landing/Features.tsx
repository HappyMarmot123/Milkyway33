import { motion } from "framer-motion";
import MagicBento from "@/components/ui/MagicBento";
import { useShinyText } from "@/hooks/useShinyText";


const featuresData = [
  {
    color: '#0a0a12',
    title: 'Model Orchestration',
    description: 'Seamlessly toggle between GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro. The right brain for every task, all in one interface.',
    label: 'Intelligence'
  },
  {
    color: '#0a0a12',
    title: 'Instant Synthesis',
    description: 'Powered by edge-caching and optimized inference pipelines. Experience lightning-fast streaming responses that keep up with your thought process.',
    label: 'Velocity'
  },
  {
    color: '#0a0a12',
    title: 'Immersive Workspace',
    description: 'A distraction-free environment crafted for deep work. Modern glassmorphic aesthetics meet ergonomic utility for extended sessions. Featuring adaptive dark mode, customizable layouts, and fluid animations that make every interaction feel alive.',
    label: 'Design'
  },
  {
    color: '#0a0a12',
    title: 'Private by Design',
    description: 'Your data stays yours. Enterprise-grade encryption, local-first options, and strict no-training policies ensure total confidentiality. Compliant with GDPR, SOC2, and HIPAA standards for complete peace of mind.',
    label: 'Security'
  },
  {
    color: '#0a0a12',
    title: 'Neural Externalities',
    description: 'Equip your AI with live web access, Python code execution, and custom API connectors. Transform conversation into action.',
    label: 'Plugins'
  },
  {
    color: '#0a0a12',
    title: 'Holographic Memory',
    description: 'Never repeat yourself. Milkyway remembers context, preferences, and project history with perfect clarity across infinite sessions.',
    label: 'Context'
  }
];

export function Features() {
  const { style, backgroundPosition, handlers } = useShinyText({
    speed: 3,
    color: 'rgba(255, 255, 255, 0.95)',
    shineColor: '#ff6b35', // Warm orange accent
    spread: 90,
    yoyo: true,
    pauseOnHover: true
  });

  return (
    <section id="features" className="py-20 sm:py-32 md:py-48 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.h2 
            className="text-3xl md:text-5xl font-bold mb-6 font-sans uppercase"
            style={{ 
              ...style,
              backgroundPosition 
            }}
            {...handlers}
          >
            Smart Features, Exceptional Experience
          </motion.h2>
        </div>

        <div className="flex justify-center">
          <MagicBento 
            textAutoHide={true}
            enableStars
            enableSpotlight
            enableBorderGlow={true}
            enableTilt={false}
            enableMagnetism={false}
            clickEffect
            spotlightRadius={200}
            particleCount={8}
            glowColor="255, 107, 53"
            disableAnimations={false}
            cards={featuresData}
          />
        </div>
      </div>
    </section>
  );
}
