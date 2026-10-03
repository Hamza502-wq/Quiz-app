import type { NextConfig } from 'next';

// STATIC_EXPORT=1 exports plain static files (the Netlify site, and `npm run build:demo`); otherwise it runs a Next.js server.
const staticExport = process.env.STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared workspace package ships TypeScript source.
  transpilePackages: ['@doorstep/web-shared'],
  ...(staticExport ? { output: 'export' as const } : {}),
};

export default nextConfig;
