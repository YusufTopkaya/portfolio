/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Output standalone build for Docker deployment
  output: "standalone",

  // 🚀 GZIP COMPRESSION - Force enable
  compress: true,

  // 🎯 Production optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  serverExternalPackages: ["pino", "pino-pretty"],

  // 🖼️ Image optimizations for better compression
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Only set Vary header to hint compression support
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Vary",
            value: "Accept-Encoding",
          },
        ],
      },
    ];
  },

  async redirects() {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

    if (!siteUrl) return [];

    const url = new URL(siteUrl);
    const targetHost = url.hostname;
    const sourceHost = targetHost.replace("www.", "");

    if (targetHost === sourceHost) return [];

    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: sourceHost,
          },
        ],
        destination: `${siteUrl}/:path*`,
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
