"use client";

import Link from "next/link";
import { WebGLShader } from "@/components/ui/web-gl-shader";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

export default function LandingPage() {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-black p-6 sm:p-12">
      <WebGLShader />

      {/* Glass panel */}
      <div className="relative z-10 w-full max-w-[min(85vw,75vh)] aspect-square border border-white/10 p-[1px] backdrop-blur-3xl backdrop-saturate-[1.8] backdrop-contrast-[1.2] backdrop-brightness-[1.1] bg-white/[0.01] flex flex-col items-center justify-center shadow-2xl">
        <main className="relative overflow-hidden border border-white/10 w-full h-full flex flex-col items-center justify-center px-8 py-12 bg-zinc-950/20 text-center">
          <p className="mb-6 text-[10px] font-bold uppercase tracking-[0.6em] text-white/30">
            Xeno&nbsp;CRM
          </p>

          <h1 className="mb-6 font-serif text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-light tracking-tight text-white leading-[0.85]">
            AI runs your
            <br /> campaigns
          </h1>

          <p className="mx-auto max-w-sm px-2 text-center text-xs sm:text-sm text-white/40 font-light leading-relaxed mb-10">
            Segment shoppers in plain English, draft on-brand messages, pick the
            best channel, and launch.
          </p>

          <div className="flex flex-col items-center justify-center gap-6 sm:gap-8 sm:flex-row">
            <Link href="/">
              <LiquidButton
                className="rounded-full border border-white/10 text-white bg-white/5 hover:bg-white/10 transition-all px-10 py-4 text-sm font-medium"
                size="xl"
              >
                Enter the CRM
              </LiquidButton>
            </Link>
            <Link
              href="/agent"
              className="text-xs uppercase tracking-[0.2em] font-bold text-white/40 underline-offset-[12px] transition-all hover:text-white hover:underline"
            >
              Try the AI Agent →
            </Link>
          </div>

          <div className="mt-12 flex items-center justify-center gap-2.5">
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/30 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-emerald-500/60">System Online</p>
          </div>
        </main>
      </div>

      <div className="absolute bottom-8 left-0 w-full flex justify-center pointer-events-none">
        <p className="relative z-10 text-[9px] uppercase tracking-[0.4em] text-white/20">
          WhatsApp · SMS · Email · RCS
        </p>
      </div>
    </div>
  );
}
