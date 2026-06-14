"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "motion/react";
import { WebGLShader } from "@/components/ui/web-gl-shader";
import { LiquidButton } from "@/components/ui/liquid-glass-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/components/theme-provider";

type Rect = { x: number; y: number; w: number; h: number };

export default function LandingPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // The glass square measures its own screen position and hands it to the
  // shader, which paints the refraction of the animated background through it.
  const glassRef = useRef<HTMLDivElement>(null);
  const [glassRect, setGlassRect] = useState<Rect | null>(null);

  const measure = useCallback(() => {
    const el = glassRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setGlassRect({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (glassRef.current) ro.observe(glassRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [measure]);

  // Entrance choreography (springy, staggered).
  const ease = [0.16, 1, 0.3, 1] as const;
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
  };
  const item = {
    hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.9, ease },
    },
  };

  const textPrimary = isDark ? "text-white" : "text-zinc-900";
  const textMuted = isDark ? "text-white/40" : "text-zinc-500";
  const textFaint = isDark ? "text-white/30" : "text-zinc-400";
  const edge = isDark ? "border-white/10" : "border-zinc-900/10";

  return (
    <div
      className={`relative flex h-screen w-full flex-col items-center justify-center overflow-hidden p-6 transition-colors duration-700 sm:p-12 ${
        isDark ? "bg-black" : "bg-[#f4f3f8]"
      }`}
    >
      <WebGLShader theme={theme} glassRect={glassRect} />

      {/* Theme toggle */}
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggle />
      </div>

      {/* Glass square — transparent; the shader refracts the bg through this
          exact rect. We only draw a sharp 1px edge + entrance animation here. */}
      <motion.div
        ref={glassRef}
        initial={{ opacity: 0, scale: 0.92, filter: "blur(14px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 1.1, ease }}
        onAnimationComplete={measure}
        className={`relative z-10 aspect-square w-full max-w-[min(85vw,75vh)] border ${edge}`}
        style={{
          // Sharp corners. Soft outer drop only — no bright inset ring (that was
          // the "side glow"). The subtle double border comes from this border +
          // the inner <main> border below.
          boxShadow: isDark
            ? "0 40px 120px rgba(0,0,0,0.6)"
            : "0 40px 120px rgba(80,60,140,0.15)",
        }}
      >
        <motion.main
          variants={container}
          initial="hidden"
          animate="show"
          className={`relative flex h-full w-full flex-col items-center justify-center border ${edge} px-8 py-12 text-center`}
        >
          <motion.p
            variants={item}
            className={`mb-6 text-[10px] font-bold uppercase tracking-[0.6em] ${textFaint}`}
          >
            Xeno&nbsp;CRM
          </motion.p>

          <motion.h1
            variants={item}
            className={`mb-6 font-serif text-5xl font-light leading-[0.85] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl ${textPrimary}`}
          >
            AI runs your
            <br /> campaigns
          </motion.h1>

          <motion.p
            variants={item}
            className={`mx-auto mb-10 max-w-sm px-2 text-center text-xs font-light leading-relaxed sm:text-sm ${textMuted}`}
          >
            Segment shoppers in plain English, draft on-brand messages, pick the
            best channel, and launch.
          </motion.p>

          <motion.div
            variants={item}
            className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-8"
          >
            <Link href="/">
              <LiquidButton
                className={`rounded-full border ${edge} px-10 py-4 text-sm font-medium ${textPrimary} ${
                  isDark ? "bg-white/5 hover:bg-white/10" : "bg-zinc-900/5 hover:bg-zinc-900/10"
                } transition-all`}
                size="xl"
              >
                Enter the CRM
              </LiquidButton>
            </Link>
            <Link
              href="/agent"
              className={`text-xs font-bold uppercase tracking-[0.2em] underline-offset-[12px] transition-all hover:underline ${textMuted} ${
                isDark ? "hover:text-white" : "hover:text-zinc-900"
              }`}
            >
              Try the AI Agent →
            </Link>
          </motion.div>

          <motion.div
            variants={item}
            className="mt-12 flex items-center justify-center gap-2.5"
          >
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/30 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-emerald-500/70">
              System Online
            </p>
          </motion.div>
        </motion.main>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1 }}
        className="pointer-events-none absolute bottom-8 left-0 flex w-full justify-center"
      >
        <p className={`relative z-10 text-[9px] uppercase tracking-[0.4em] ${textFaint}`}>
          WhatsApp · SMS · Email · RCS
        </p>
      </motion.div>
    </div>
  );
}
