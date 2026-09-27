import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The shared workspace package ships TypeScript source.
  transpilePackages: ['@doorstep/web-shared'],
};

export default nextConfig;
