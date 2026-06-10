import { withWorkflow } from "workflow/next"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // bash-tool / just-bash use top-level await and Node builtins. Keep them out
  // of the bundler so the step runtime loads them natively from node_modules.
  // They are only ever reached via dynamic import inside "use step" functions,
  // so they never enter the workflow's deterministic VM bundle.
  serverExternalPackages: ["bash-tool", "just-bash"],
  images: {
    unoptimized: true,
  },
}

export default withWorkflow(nextConfig)
