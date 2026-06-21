"use client";

import { motion } from 'motion/react';

interface ResponsiveHeroBannerProps {
    backgroundImageUrl?: string;
    title?: string;
    titleLine2?: string;
    description?: string;
    primaryButtonText?: string;
    primaryButtonHref?: string;
}

const ResponsiveHeroBanner = ({
    backgroundImageUrl = "https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/0e2dbea0-c0a9-413f-a57b-af279633c0df_3840w.jpg",
    title = "Journey Beyond Earth",
    titleLine2 = "Into the Cosmos",
    description = "Experience the cosmos like never before. Our advanced spacecraft and cutting-edge technology make interplanetary travel accessible, safe, and unforgettable.",
    primaryButtonText = "Book Your Journey",
    primaryButtonHref = "#",
}: ResponsiveHeroBannerProps) => {

    return (
        <section>
            <img
                src={backgroundImageUrl}
                alt=""
                className="w-full h-full object-cover absolute top-0 right-0 bottom-0 left-0" />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-black/30" />
            <header className="z-10 xl:top-4 relative">
                <div className="mx-6">
                </div>
            </header>
            <div className="z-10 relative">
                <div className="max-w-7xl mx-auto pt-28 sm:pt-36 md:pt-48 lg:pt-[18rem] px-6">
                    <div className="max-w-4xl text-left">
                        <motion.h1
                            className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl tracking-tight font-extrabold pb-4 bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-[#ff6b35] leading-[1] md:leading-[0.9] font-sans animate-[fadeSlideIn_0.6s_ease-out_0.1s_forwards] opacity-0"
                        >
                            {title}
                            <br />
                            <span>{titleLine2}</span>
                        </motion.h1>

                        <p
                            className="text-base sm:text-lg md:text-xl animate-[fadeSlideIn_0.6s_ease-out_0.3s_forwards] opacity-0 text-white/70 max-w-xl mt-8 leading-relaxed font-sans">
                            {description}
                        </p>

                        <div
                            className="flex flex-col sm:flex-row sm:gap-4 mt-10 gap-3 items-start animate-[fadeSlideIn_0.6s_ease-out_0.5s_forwards] opacity-0">
                            <a
                                href={primaryButtonHref}
                                className="inline-flex items-center gap-2 hover:bg-white/20 text-sm font-medium text-white bg-white/10 ring-1 ring-[#ff6b35] shadow-[0_0_15px_rgba(255,107,53,0.5)] hover:shadow-[0_0_25px_rgba(255,107,53,0.7)] rounded-full py-3 px-6 font-sans transition-all duration-300 transform hover:-translate-y-0.5"
                            >
                                {primaryButtonText}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="h-4 w-4">
                                    <path d="M5 12h14" />
                                    <path d="m12 5 7 7-7 7" />
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export { ResponsiveHeroBanner };
export default ResponsiveHeroBanner;
