import React from "react";
import { Composition } from "remotion";
import { XenoIntro } from "./XenoIntro";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="XenoIntro"
      component={XenoIntro}
      durationInFrames={210}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        title: "Xeno CRM",
        subtitle: "AI-Native Mini CRM",
        stats: { customers: 1240, segments: 8, campaigns: 23, deliveryRate: 94 },
      }}
    />
  );
};
