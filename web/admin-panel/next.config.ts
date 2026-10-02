import type { NextConfig } from 'next';

// STATIC_EXPORT=1 exports plain static files; NEXT_PUBLIC_BASE_PATH serves the app
// under a sub-path (e.g. "/vendor") when it shares a domain with the other apps.
const staticExport = process.env.STATIC_EXPORT === '1';
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared workspace package ships TypeScript source.
  transpilePackages: ['@doorstep/web-shared'],
  ...(basePath ? { basePath } : {}),
  ...(staticExport ? { output: 'export' as const } : {}),
};

export default nextConfig;
