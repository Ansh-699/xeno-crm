"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-base font-semibold tracking-tight">
          Xeno <span className="text-muted-foreground font-medium">CRM</span>
        </span>
      </header>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar: static on desktop, slide-in drawer on mobile */}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)}>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="md:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </Sidebar>

      <main className="md:pl-56 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
