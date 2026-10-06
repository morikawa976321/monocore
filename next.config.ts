import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 親フォルダ(C:\Users\tm976\mf)にも package-lock.json があり、Turbopack がワークスペースの根を
  // 親と誤推定して dev サーバーで `Cannot find module 'lucide-react'` を出す(2026-10-07)。根をこの
  // リポジトリに固定する。Vercel ではもともとリポジトリが根なので挙動は変わらない。
  turbopack: { root: __dirname },
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
