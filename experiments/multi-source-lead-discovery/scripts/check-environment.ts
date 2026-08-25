import nextEnv from "@next/env";

import { discoveryEnvironmentStatus } from "../lib/providers";

nextEnv.loadEnvConfig(process.cwd());

const providers = discoveryEnvironmentStatus();
console.log(JSON.stringify({
  ready: providers.every((provider) => provider.configured),
  configuredCount: providers.filter((provider) => provider.configured).length,
  providerCount: providers.length,
  providers,
  note: "This command checks configuration only and makes no paid API calls.",
}, null, 2));
