import assert from 'node:assert/strict';
import { detectUpdateSupport } from '../src/main/services/update-support';

assert.deepEqual(
  detectUpdateSupport({
    platform: 'linux',
    isPackaged: true,
    isDevelopment: false,
    appImagePath: '/tmp/SuwolVisualReference.AppImage'
  }),
  { supported: true }
);

assert.deepEqual(
  detectUpdateSupport({
    platform: 'win32',
    isPackaged: true,
    isDevelopment: false,
    appImagePath: null
  }),
  { supported: false, reason: 'unsupportedPlatform' }
);

assert.deepEqual(
  detectUpdateSupport({
    platform: 'darwin',
    isPackaged: true,
    isDevelopment: false,
    appImagePath: null
  }),
  { supported: false, reason: 'unsupportedPlatform' }
);

assert.deepEqual(
  detectUpdateSupport({
    platform: 'linux',
    isPackaged: false,
    isDevelopment: true,
    appImagePath: null
  }),
  { supported: false, reason: 'updaterDisabledInDevelopment' }
);

assert.deepEqual(
  detectUpdateSupport({
    platform: 'linux',
    isPackaged: false,
    isDevelopment: false,
    appImagePath: null
  }),
  { supported: false, reason: 'notPackaged' }
);

assert.deepEqual(
  detectUpdateSupport({
    platform: 'linux',
    isPackaged: true,
    isDevelopment: false,
    appImagePath: null
  }),
  { supported: false, reason: 'notAppImage' }
);

console.log('[update-support] all checks passed');
