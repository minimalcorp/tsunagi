import type { SandboxPreset, SandboxRuntimeConfig } from '@/types/sandbox';

/**
 * Predefined sandbox configuration presets
 */
export const SANDBOX_PRESETS: Record<SandboxPreset, SandboxRuntimeConfig> = {
  development: {
    network: {
      allowedDomains: ['*'],
      deniedDomains: [],
    },
    filesystem: {
      denyRead: [],
      allowWrite: ['.'],
      denyWrite: [],
    },
  },

  production: {
    network: {
      allowedDomains: [
        'api.anthropic.com',
        'github.com',
        'npmjs.com',
        ...(process.env.ALLOWED_DOMAINS?.split(',') || []),
      ],
      deniedDomains: [],
    },
    filesystem: {
      denyRead: ['~/.ssh', '~/.aws', '~/.config'],
      allowWrite: [process.env.ALLOWED_WORKSPACE || '/app/workspace'],
      denyWrite: ['**/.env*', '**/credentials*'],
    },
  },

  strict: {
    network: {
      allowedDomains: ['api.anthropic.com'],
      deniedDomains: [],
    },
    filesystem: {
      denyRead: ['~/.ssh', '~/.aws', '~/.config', '~/.*'],
      allowWrite: ['/app/workspace/output'],
      denyWrite: ['**/.env*', '**/credentials*', '**/secrets*'],
    },
  },
};

/**
 * Get sandbox preset by name
 */
export function getSandboxPreset(preset: SandboxPreset): SandboxRuntimeConfig {
  return SANDBOX_PRESETS[preset];
}
