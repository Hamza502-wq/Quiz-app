import type { NextConfig } from 'next';

// `npm run build:demo` exports plain static files (see netlify.toml); the normal build runs a Next.js server.
const staticExport = process.env.STATIC_EXPORT === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared workspace package ships TypeScript source.
  transpilePackages: ['@doorstep/web-shared'],
  ...(staticExport ? { output: 'export' as const } : {}),
};

export default nextConfig;
