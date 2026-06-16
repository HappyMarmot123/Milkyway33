import { FooterBackgroundGradient, TextHoverEffect } from "@/components/ui/hover-footer";

export function BrandBanner() {
  return (
    <section 
      className="bg-[#0F0F11]/50 relative h-fit overflow-hidden py-[5rem]"
    >
      <div className="flex items-center justify-center h-[12rem] md:h-[16rem] pointer-events-none">
        <div className="relative w-full h-full pointer-events-auto z-10">
          <TextHoverEffect text="MILKY WAY" className="z-50" />
        </div>
      </div>

      <FooterBackgroundGradient />
    </section>
  );
}
