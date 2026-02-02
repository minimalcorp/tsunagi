/**
 * Sandbox configuration for query execution
 */
export interface QuerySandboxConfig {
  /** Paths allowed for writing */
  allowWrite: string[];
  /** Paths denied for reading */
  denyRead: string[];
  /** Domains allowed for network access */
  allowedDomains: string[];
}

/**
 * Sandbox preset types
 */
export type SandboxPreset = 'development' | 'production' | 'strict';

/**
 * Sandbox Runtime configuration
 * (Re-export from @anthropic-ai/sandbox-runtime for type safety)
 */
export interface SandboxRuntimeConfig {
  network: {
    allowedDomains: string[];
    deniedDomains: string[];
  };
  filesystem: {
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
  };
}
