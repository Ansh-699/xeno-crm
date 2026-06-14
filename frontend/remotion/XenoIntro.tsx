import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Sparkles, Users, Target, Megaphone, TrendingUp } from "lucide-react";

export type XenoIntroProps = {
  title: string;
  subtitle: string;
  stats: {
    customers: number;
    segments: number;
    campaigns: number;
    deliveryRate: number;
  };
};

const VIOLET = "#a78bfa";

const StatChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  delay: number;
  color: string;
}> = ({ icon, label, value, suffix = "", delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const count = Math.round(
    interpolate(frame, [delay, delay + 40], [0, value], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  return (
    <div
      style={{
        transform: `translateY(${interpolate(appear, [0, 1], [40, 0])}px) scale(${interpolate(
          appear,
          [0, 1],
          [0.9, 1]
        )})`,
        opacity: appear,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "28px 36px",
        borderRadius: 20,
        border: "1px solid #27272a",
        background: "#18181b",
        minWidth: 240,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "#a1a1aa",
          fontSize: 26,
        }}
      >
        <span style={{ color, display: "flex" }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 64, fontWeight: 700, color: "white" }}>
        {count.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
};

export const XenoIntro: React.FC<XenoIntroProps> = ({ title, subtitle, stats }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const logo = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 30 });
  const logoRotate = interpolate(logo, [0, 1], [-30, 0]);

  const titleProgress = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const titleY = interpolate(titleProgress, [0, 1], [60, 0]);

  const subtitleOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const taglineOpacity = interpolate(frame, [150, 170], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowX = interpolate(frame, [0, durationInFrames], [-200, 200]);

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#09090b",
        fontFamily: "Inter, system-ui, sans-serif",
        opacity: fadeOut,
      }}
    >
      {/* Drifting violet glow */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            position: "absolute",
            width: 1100,
            height: 1100,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.18), transparent 60%)",
            transform: `translateX(${glowX}px)`,
            filter: "blur(40px)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{ alignItems: "center", justifyContent: "center", gap: 24 }}
      >
        {/* Logo */}
        <div
          style={{
            transform: `scale(${logo}) rotate(${logoRotate}deg)`,
            opacity: logo,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: 28,
            background: "rgba(139,92,246,0.12)",
            border: "1px solid rgba(139,92,246,0.4)",
          }}
        >
          <Sparkles size={64} color={VIOLET} />
        </div>

        {/* Title */}
        <div
          style={{
            transform: `translateY(${titleY}px)`,
            opacity: titleProgress,
            fontSize: 110,
            fontWeight: 800,
            color: "white",
            letterSpacing: -2,
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            opacity: subtitleOpacity,
            fontSize: 38,
            color: "#a1a1aa",
            fontWeight: 500,
          }}
        >
          {subtitle}
        </div>

        {/* Count-up stat chips */}
        <div style={{ display: "flex", gap: 24, marginTop: 40 }}>
          <StatChip icon={<Users size={28} />} label="Customers" value={stats.customers} delay={70} color="#60a5fa" />
          <StatChip icon={<Target size={28} />} label="Segments" value={stats.segments} delay={82} color="#34d399" />
          <StatChip icon={<Megaphone size={28} />} label="Campaigns" value={stats.campaigns} delay={94} color="#fbbf24" />
          <StatChip icon={<TrendingUp size={28} />} label="Avg Delivery" value={stats.deliveryRate} suffix="%" delay={106} color={VIOLET} />
        </div>

        {/* Lifecycle tagline */}
        <div
          style={{
            opacity: taglineOpacity,
            marginTop: 48,
            fontSize: 30,
            color: "#71717a",
            letterSpacing: 1,
          }}
        >
          Ingest → Segment with AI → Launch → Attribute → Insights
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
