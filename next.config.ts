import type { NextConfig } from "next";

const isTauriExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(isTauriExport
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
