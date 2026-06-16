import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import RotatingText from '@/components/ui/RotatingText';
import FallingText from '@/components/ui/FallingText';

import CircularText from '@/components/ui/CircularText';

export function PhysicsSection() {
  const containerRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);

  return (
    <section ref={containerRef} className="relative w-full overflow-hidden py-32 flex flex-col items-center justify-center">
{/* Natural Circular Background centered on title */}
            <div 
              className="absolute z-10 left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full -z-10 opacity-80 pointer-events-none blur-3xl"
              style={{
                backgroundColor: '#1c0a05',
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E"), radial-gradient(circle at center, #3f1609 0%, #1c0a05 50%, transparent 70%)`,
              }}
            />
      <div className="container px-4 relative z-10">
        <div className="flex flex-col items-center text-center mb-20">
          <div className="flex justify-center mb-8">
            <CircularText
              text="PHYSICS • MILKYWAY AI • "
              onHover="speedUp"
              spinDuration={20}
              className="text-primary"
            />
          </div>
          <motion.div 
            style={{ y, opacity }}
            className="flex items-center gap-2 sm:gap-4 text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60 leading-[1.1]"
          >
            <span>Milky Way that is</span>
            <div className="bg-primary/10 border border-primary/20 px-3 sm:px-4 py-1 sm:py-2 rounded-xl text-primary inline-flex items-center justify-center">
              <RotatingText
                texts={['Limitless', 'Brilliant', 'Cosmic', 'Stellar', 'Infinite', 'Luminous', 'Yours']}
                mainClassName="overflow-hidden justify-center rounded-lg text-primary"
                staggerFrom="last"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "-120%" }}
                staggerDuration={0.025}
                splitLevelClassName="overflow-hidden pb-1"
                transition={{ type: "spring", damping: 30, stiffness: 400 }}
                rotationInterval={3000}
              />
            </div>
          </motion.div>
        </div>

        {/* Falling Text Canvas */}
        <div className="w-[80%] h-[300px] mx-auto rounded-3xl border border-white/10 bg-black/40 backdrop-blur-sm relative overflow-hidden">
          <FallingText
            text={`Limitless Brilliant Cosmic Stellar Infinite Luminous Yours`}
            highlightWords={["Yours"]}
            highlightClass="text-primary font-bold"
            trigger="scroll"
            backgroundColor="transparent"
            wireframes={false}
            gravity={0.3}
            fontSize="1.5rem"
            mouseConstraintStiffness={0.2}
            className="w-full h-full text-white/80"
          />
          
        </div>
      </div>
    </section>
  );
}
