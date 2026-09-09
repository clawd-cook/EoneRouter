import type { NextConfig } from "next";
import { MAX_PACKAGE_BODY_BYTES } from "./lib/eone/package-http";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["jdcleaning-man-web-test.web.jdtest.net"],
  experimental: {
    // proxy.ts buffers the body (default 10MB). Spec upload ceiling is 100 MiB.
    proxyClientMaxBodySize: MAX_PACKAGE_BODY_BYTES,
  },
};

export default nextConfig;
