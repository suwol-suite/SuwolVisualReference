import type { UpdateSupportReason } from '../../shared/types';

export type UpdateSupportInput = {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  isDevelopment: boolean;
  appImagePath?: string | null;
};

export type UpdateSupportResult =
  | {
      supported: true;
    }
  | {
      supported: false;
      reason: UpdateSupportReason;
    };

export function detectUpdateSupport(input: UpdateSupportInput): UpdateSupportResult {
  if (input.platform !== 'linux') {
    return { supported: false, reason: 'unsupportedPlatform' };
  }

  if (input.isDevelopment) {
    return { supported: false, reason: 'updaterDisabledInDevelopment' };
  }

  if (!input.isPackaged) {
    return { supported: false, reason: 'notPackaged' };
  }

  if (!input.appImagePath) {
    return { supported: false, reason: 'notAppImage' };
  }

  return { supported: true };
}
