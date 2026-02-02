import type { QuerySandboxConfig, SandboxRuntimeConfig } from '@/types/sandbox';

/**
 * Sensitive file patterns that should always be denied
 */
export const SENSITIVE_PATTERNS = [
  '~/.ssh',
  '~/.aws',
  '~/.config',
  '**/.env*',
  '**/credentials*',
  '**/secrets*',
  '**/id_rsa*',
  '**/*.pem',
];

/**
 * Convert QuerySandboxConfig to SandboxRuntimeConfig
 */
export function toSandboxRuntimeConfig(config: QuerySandboxConfig): SandboxRuntimeConfig {
  return {
    network: {
      allowedDomains: config.allowedDomains,
      deniedDomains: [],
    },
    filesystem: {
      denyRead: config.denyRead,
      allowWrite: config.allowWrite,
      denyWrite: SENSITIVE_PATTERNS,
    },
  };
}

/**
 * Merge multiple configs (union of permissions)
 */
export function mergeConfigs(...configs: QuerySandboxConfig[]): SandboxRuntimeConfig {
  if (configs.length === 0) {
    throw new Error('At least one config is required');
  }

  return {
    network: {
      allowedDomains: Array.from(new Set(configs.flatMap((c) => c.allowedDomains))),
      deniedDomains: [],
    },
    filesystem: {
      denyRead: Array.from(new Set(configs.flatMap((c) => c.denyRead))),
      allowWrite: Array.from(new Set(configs.flatMap((c) => c.allowWrite))),
      denyWrite: SENSITIVE_PATTERNS,
    },
  };
}

/**
 * Get strictest config (intersection of permissions)
 */
export function strictestConfig(...configs: QuerySandboxConfig[]): SandboxRuntimeConfig {
  if (configs.length === 0) {
    throw new Error('At least one config is required');
  }

  if (configs.length === 1) {
    return toSandboxRuntimeConfig(configs[0]);
  }

  return {
    network: {
      // Intersection: only domains allowed in ALL configs
      allowedDomains: configs.reduce(
        (acc, c) => acc.filter((d) => c.allowedDomains.includes(d)),
        configs[0].allowedDomains
      ),
      deniedDomains: [],
    },
    filesystem: {
      // Union: deny if ANY config denies
      denyRead: Array.from(new Set(configs.flatMap((c) => c.denyRead))),
      // Intersection: only paths allowed in ALL configs
      allowWrite: configs.reduce(
        (acc, c) => acc.filter((p) => c.allowWrite.includes(p)),
        configs[0].allowWrite
      ),
      denyWrite: SENSITIVE_PATTERNS,
    },
  };
}
