"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Users,
  Target,
  Megaphone,
  Bot,
  BarChart3,
} from "lucide-react";
import { AISettingsButton } from "./AISettings";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/segments", label: "Segments", icon: Target },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/agent", label: "AI Agent", icon: Bot },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
  /** Optional slot rendered in the header (e.g. a mobile close button). */
  children?: React.ReactNode;
}

export function Sidebar({ mobileOpen, onClose, children }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={clsx(
        "fixed inset-y-0 left-0 z-50 w-56 border-r border-border bg-background flex flex-col",
        "transition-transform duration-300 ease-in-out",
        // Drawer behaviour on mobile, always visible on desktop
        "md:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <div className="flex h-14 items-center justify-between px-5 border-b border-border">
        <div className="flex items-center">
          <span className="text-lg font-semibold tracking-tight">Xeno</span>
          <span className="ml-1.5 text-xs text-muted-foreground font-medium">
            CRM
          </span>
        </div>
        {children}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">AI-Native CRM</p>
          <AISettingsButton />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
