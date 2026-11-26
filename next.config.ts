import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  outputFileTracingIncludes: { "/api/**": ["./supabase/certs/*.crt"] },
};

export default nextConfig;
