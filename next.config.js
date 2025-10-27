/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Output standalone build for Docker deployment
  output: 'standalone',

  // 🚀 GZIP COMPRESSION - Force enable
  compress: true,

  // 🎯 Production optimizations
  compiler: {
    // Remove console.log statements in production for smaller bundles
    removeConsole: process.env.NODE_ENV === "production",
  },

  serverExternalPackages: ['pino', 'pino-pretty'],

  // 🖼️ Image optimizations for better compression
  images: {
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
};

module.exports = nextConfig;
