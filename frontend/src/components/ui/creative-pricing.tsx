import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PricingTier {
  name: string;
  icon: React.ReactNode;
  price: number | string;
  description: string;
  features: string[];
  popular?: boolean;
  /** tailwind color name, e.g. "violet" — used for the icon accent */
  color: string;
  cta?: string;
  href?: string;
}

const ICON_COLOR: Record<string, string> = {
  violet: "text-violet-500",
  amber: "text-amber-500",
  blue: "text-sky-500",
  emerald: "text-emerald-500",
};

export function CreativePricing({
  tag = "Simple Pricing",
  title = "Choose the plan that suits you",
  description = "Start free with your own AI key — upgrade when you scale.",
  tiers,
}: {
  tag?: string;
  title?: string;
  description?: string;
  tiers: PricingTier[];
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <div className="mb-14 space-y-5 text-center">
        <div className="font-sans text-2xl text-violet-500 rotate-[-1deg]">{tag}</div>
        <div className="relative inline-block">
          <h2 className="font-sans text-4xl font-bold text-foreground rotate-[-1deg] md:text-6xl">
            {title}
          </h2>
          <div className="absolute -bottom-3 left-1/2 h-3 w-44 -translate-x-1/2 rotate-[-1deg] rounded-full bg-violet-500/20 blur-sm" />
        </div>
        <p className="font-sans text-xl text-muted-foreground rotate-[-1deg]">{description}</p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {tiers.map((tier, index) => (
          <div
            key={tier.name}
            className={cn(
              "group relative transition-all duration-300",
              index === 0 && "rotate-[-1deg]",
              index === 1 && "rotate-[1deg]",
              index === 2 && "rotate-[-2deg]"
            )}
          >
            <div
              className={cn(
                "absolute inset-0 rounded-lg border-2 border-zinc-900 bg-white transition-all duration-300 dark:border-white dark:bg-zinc-900",
                "shadow-[4px_4px_0px_0px] shadow-zinc-900 dark:shadow-white",
                "group-hover:translate-x-[-4px] group-hover:translate-y-[-4px] group-hover:shadow-[8px_8px_0px_0px]"
              )}
            />

            <div className="relative p-6">
              {tier.popular && (
                <div className="absolute -right-2 -top-2 rotate-12 rounded-full border-2 border-zinc-900 bg-violet-400 px-3 py-1 font-sans text-sm text-zinc-900">
                  Popular!
                </div>
              )}

              <div className="mb-6">
                <div
                  className={cn(
                    "mb-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-zinc-900 dark:border-white",
                    ICON_COLOR[tier.color] ?? "text-violet-500"
                  )}
                >
                  {tier.icon}
                </div>
                <h3 className="font-sans text-3xl text-foreground">{tier.name}</h3>
                <p className="font-sans text-lg text-muted-foreground">{tier.description}</p>
              </div>

              <div className="mb-6 font-sans">
                <span className="text-5xl font-bold text-foreground">
                  {typeof tier.price === "number" ? `$${tier.price}` : tier.price}
                </span>
                {typeof tier.price === "number" && (
                  <span className="text-xl text-muted-foreground">/month</span>
                )}
              </div>

              <div className="mb-6 space-y-3">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-900 dark:border-white">
                      <Check className="h-3 w-3 text-foreground" />
                    </div>
                    <span className="font-sans text-lg text-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Link
                href={tier.href ?? "/"}
                className={cn(
                  "flex h-12 w-full items-center justify-center rounded-md border-2 border-zinc-900 font-sans text-lg transition-all duration-300 dark:border-white",
                  "shadow-[4px_4px_0px_0px] shadow-zinc-900 dark:shadow-white",
                  "hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px]",
                  tier.popular
                    ? "bg-violet-400 text-zinc-900 hover:bg-violet-300"
                    : "bg-zinc-50 text-zinc-900 hover:bg-white dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700"
                )}
              >
                {tier.cta ?? "Get Started"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
