import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // localhost と 127.0.0.1 は別オリジン扱いになるため、
  // 127.0.0.1 で開いたときに HMR / _next リソースがブロックされないようにする。
  allowedDevOrigins: ["127.0.0.1"],
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/icon.png",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
