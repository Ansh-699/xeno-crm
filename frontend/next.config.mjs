/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a minimal, self-contained server bundle (.next/standalone) so the
  // Docker runtime image ships only the traced dependencies instead of the
  // full node_modules tree — much smaller image, faster cold start.
  output: "standalone",
};

export default nextConfig;
