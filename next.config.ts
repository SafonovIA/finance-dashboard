import type { NextConfig } from 'next';

const nextConfig: NextConfig = process.env.FINANCE_RUNTIME === 'node'
  ? { output: 'standalone' }
  : {};

export default nextConfig;
