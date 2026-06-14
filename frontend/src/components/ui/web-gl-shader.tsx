"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface WebGLShaderProps {
  /** 0 = dark, 1 = light. Animated smoothly inside the shader. */
  theme?: "light" | "dark";
  /**
   * Screen-space rect (in CSS pixels, origin top-left) of the glass square the
   * shader should refract. The shader samples the background through this rect
   * with offset UVs + chromatic aberration to fake real glass refraction.
   */
  glassRect?: { x: number; y: number; w: number; h: number } | null;
}

export function WebGLShader({ theme = "dark", glassRect = null }: WebGLShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene | null;
    camera: THREE.OrthographicCamera | null;
    renderer: THREE.WebGLRenderer | null;
    mesh: THREE.Mesh | null;
    uniforms: any;
    animationId: number | null;
  }>({
    scene: null,
    camera: null,
    renderer: null,
    mesh: null,
    uniforms: null,
    animationId: null,
  });

  // Keep latest props in refs so the animation loop reads them without re-init.
  const themeTargetRef = useRef(theme === "light" ? 1 : 0);
  const glassRectRef = useRef(glassRect);

  useEffect(() => {
    themeTargetRef.current = theme === "light" ? 1 : 0;
  }, [theme]);

  useEffect(() => {
    glassRectRef.current = glassRect;
  }, [glassRect]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const { current: refs } = sceneRef;

    const vertexShader = /* glsl */ `
      attribute vec3 position;
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    // The background is a flowing chromatic interference field. We compute it as
    // a reusable function bgColor(uv) so the glass region can re-sample it at
    // displaced coordinates — that resampling IS the refraction.
    const fragmentShader = /* glsl */ `
      precision highp float;

      uniform vec2  resolution;
      uniform float time;
      uniform float xScale;
      uniform float yScale;
      uniform float distortion;
      uniform float theme;        // 0 = dark, 1 = light (smoothed on CPU)
      uniform vec4  glassRect;    // x, y, w, h  in pixels, origin TOP-left
      uniform float glassActive;  // 1 if a rect is present, else 0

      // ---- Background field -------------------------------------------------
      // p is the centered, aspect-corrected coordinate.
      vec3 bgColor(vec2 p) {
        float d = length(p) * distortion;

        float rx = p.x * (1.0 + d);
        float gx = p.x;
        float bx = p.x * (1.0 - d);

        float r = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
        float g = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
        float b = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);

        vec3 dark = vec3(r, g, b);   // neutral chromatic streaks (no violet tint)

        // Light theme: invert energy into a soft pearl wash. The same
        // sine bands become gentle darker violet streaks on a bright field.
        float band = (r + g + b) / 3.0;
        vec3 light = vec3(0.96, 0.95, 0.99) - band * vec3(0.35, 0.45, 0.25);
        light = clamp(light, 0.0, 1.0);

        return mix(dark, light, theme);
      }

      // Convert a fragCoord (origin bottom-left in GL) to the centered p-space.
      vec2 toP(vec2 fragPx) {
        return (fragPx * 2.0 - resolution) / min(resolution.x, resolution.y);
      }

      void main() {
        vec2 fragPx = gl_FragCoord.xy;
        vec3 col = bgColor(toP(fragPx));

        if (glassActive > 0.5) {
          // Convert rect (top-left origin) to GL space (bottom-left origin).
          float gx = glassRect.x;
          float gy = resolution.y - glassRect.y - glassRect.w; // square: w==h
          float gw = glassRect.z;
          float gh = glassRect.w;

          vec2 local = (fragPx - vec2(gx, gy)) / vec2(gw, gh); // 0..1 inside

          vec2 c = local - 0.5;
          float chess = max(abs(c.x), abs(c.y));    // square metric: <=0.5 inside

          if (chess <= 0.5) {
            float edge = chess;                       // 0 center -> 0.5 edge

            // Gentle lens displacement near the rim — subtle, the streak should
            // mostly just pass THROUGH the panel (dimmed), not warp dramatically.
            float bend = pow(edge * 2.0, 3.0) * 0.03;
            vec2 dir = normalize(c + 1e-5);
            vec2 disp = dir * bend;

            // Slight chromatic aberration at the edges only.
            vec2 baseUv = local + disp;
            float ca = 0.002 + edge * 0.006;
            vec2 px = vec2(gw, gh);
            vec2 toFrag = vec2(gx, gy);

            vec2 uvR = (baseUv + dir * ca) * px + toFrag;
            vec2 uvG = (baseUv)            * px + toFrag;
            vec2 uvB = (baseUv - dir * ca) * px + toFrag;

            vec3 refr;
            refr.r = bgColor(toP(uvR)).r;
            refr.g = bgColor(toP(uvG)).g;
            refr.b = bgColor(toP(uvB)).b;

            // IMPORTANT: the background streak is HDR (values >> 1.0), so it
            // clips to white. Clamp to [0,1] FIRST, then darken — otherwise a
            // bright streak stays blown out no matter the tint.
            vec3 base = clamp(refr, 0.0, 1.0);

            // Tinted DARK glass: the streak shows through muted (not blown out),
            // blacks lifted a hair so the panel reads as translucent glass.
            float TINT = 0.42;                          // <- darkness (lower = darker / dimmer streak)
            vec3 glassDark = base * TINT + 0.015;
            vec3 glassLight = mix(base, vec3(1.0), 0.06);
            vec3 glass = mix(glassDark, glassLight, theme);

            // Soft sheen near the TOP edge only — no full-rim side glow.
            float top = smoothstep(0.55, 1.0, local.y);
            glass += top * 0.05 * (1.0 - theme);

            col = glass;
          }
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const initScene = () => {
      refs.scene = new THREE.Scene();
      refs.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      refs.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

      refs.uniforms = {
        resolution: { value: [window.innerWidth, window.innerHeight] },
        time: { value: 0.0 },
        xScale: { value: 1.0 },
        yScale: { value: 0.5 },
        distortion: { value: 0.05 },
        theme: { value: themeTargetRef.current },
        glassRect: { value: [0, 0, 0, 0] },
        glassActive: { value: 0 },
      };

      const position = [
        -1.0, -1.0, 0.0, 1.0, -1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0,
        1.0, 0.0, 1.0, 1.0, 0.0,
      ];

      const positions = new THREE.BufferAttribute(new Float32Array(position), 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", positions);

      const material = new THREE.RawShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: refs.uniforms,
        side: THREE.DoubleSide,
      });

      refs.mesh = new THREE.Mesh(geometry, material);
      refs.scene.add(refs.mesh);

      handleResize();
    };

    const animate = () => {
      const u = refs.uniforms;
      if (u) {
        u.time.value += 0.01;

        // Smoothly ease theme value toward target for a nice cross-fade.
        u.theme.value += (themeTargetRef.current - u.theme.value) * 0.08;

        const dpr = refs.renderer ? refs.renderer.getPixelRatio() : 1;
        const rect = glassRectRef.current;
        if (rect) {
          u.glassActive.value = 1;
          u.glassRect.value = [
            rect.x * dpr,
            rect.y * dpr,
            rect.w * dpr,
            rect.h * dpr,
          ];
        } else {
          u.glassActive.value = 0;
        }
      }
      if (refs.renderer && refs.scene && refs.camera) {
        refs.renderer.render(refs.scene, refs.camera);
      }
      refs.animationId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      if (!refs.renderer || !refs.uniforms) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      refs.renderer.setSize(width, height, false);
      const dpr = refs.renderer.getPixelRatio();
      refs.uniforms.resolution.value = [width * dpr, height * dpr];
    };

    initScene();
    animate();
    window.addEventListener("resize", handleResize);

    return () => {
      if (refs.animationId) cancelAnimationFrame(refs.animationId);
      window.removeEventListener("resize", handleResize);
      if (refs.mesh) {
        refs.scene?.remove(refs.mesh);
        refs.mesh.geometry.dispose();
        if (refs.mesh.material instanceof THREE.Material) {
          refs.mesh.material.dispose();
        }
      }
      refs.renderer?.dispose();
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full block" />
  );
}
