import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Google account profile images are served from *.googleusercontent.com.
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
