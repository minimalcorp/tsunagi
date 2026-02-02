import type { QuerySandboxConfig } from '@/types/sandbox';

/**
 * Get sandbox configuration for a specific action
 */
export function getConfigForAction(action: string): QuerySandboxConfig {
  switch (action) {
    case 'refactor':
      return {
        allowWrite: [process.cwd() + '/src'],
        denyRead: ['~/.ssh', '~/.aws'],
        allowedDomains: ['github.com'],
      };

    case 'analyze':
      return {
        allowWrite: [process.cwd() + '/data'],
        denyRead: ['~/.ssh', '~/.aws', process.cwd() + '/src'],
        allowedDomains: ['api.example.com'],
      };

    case 'test':
      return {
        allowWrite: [process.cwd() + '/__tests__', process.cwd() + '/tests'],
        denyRead: ['~/.ssh', '~/.aws'],
        allowedDomains: ['npmjs.com'],
      };

    default:
      // Default: strict configuration
      return {
        allowWrite: [process.cwd()],
        denyRead: ['~/.ssh', '~/.aws', '~/.config'],
        allowedDomains: ['api.anthropic.com'],
      };
  }
}
