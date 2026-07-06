import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import { IPC_CHANNELS } from '@shared/ipc';
import type { UpdatePreferenceInput, UpdatePreferences, UpdateStatus } from '@shared/types';
import { detectUpdateSupport } from './update-support';

const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
  autoCheck: true,
  autoDownload: false,
  lastCheckedAt: null
};

type SendUpdateEvent = (channel: string, payload: UpdateStatus) => void;

export class UpdateService {
  private readonly preferencesPath: string;
  private readonly sendEvent: SendUpdateEvent;
  private preferences: UpdatePreferences;
  private status: UpdateStatus;
  private updater: AppUpdater | null = null;

  private constructor(sendEvent: SendUpdateEvent) {
    this.preferencesPath = path.join(app.getPath('userData'), 'update-preferences.json');
    this.sendEvent = sendEvent;
    this.preferences = this.readPreferences();
    this.status = this.createInitialStatus();
  }

  static async create(sendEvent: SendUpdateEvent): Promise<UpdateService> {
    const service = new UpdateService(sendEvent);
    await service.configureUpdater();
    return service;
  }

  getStatus(): UpdateStatus {
    return { ...this.status, progress: this.status.progress ? { ...this.status.progress } : undefined };
  }

  getPreferences(): UpdatePreferences {
    return { ...this.preferences };
  }

  setPreferences(input: UpdatePreferenceInput): UpdatePreferences {
    this.preferences = {
      ...this.preferences,
      autoCheck: typeof input.autoCheck === 'boolean' ? input.autoCheck : this.preferences.autoCheck,
      autoDownload: typeof input.autoDownload === 'boolean' ? input.autoDownload : this.preferences.autoDownload
    };
    if (this.updater) {
      this.updater.autoDownload = this.preferences.autoDownload;
    }
    this.writePreferences();
    this.emitStatus();
    return this.getPreferences();
  }

  async runStartupCheck(): Promise<void> {
    if (!this.status.supported || !this.preferences.autoCheck) {
      this.emitStatus();
      return;
    }

    await this.checkForUpdates();
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.status.supported) {
      this.emitStatus();
      return this.getStatus();
    }

    const updater = this.requireUpdater();
    if (!updater) {
      return this.getStatus();
    }

    this.updateStatus({
      phase: 'checking',
      errorMessage: undefined,
      progress: undefined
    });

    try {
      await updater.checkForUpdates();
    } catch (error) {
      this.handleError(error);
    }

    return this.getStatus();
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (!this.status.supported) {
      this.emitStatus();
      return this.getStatus();
    }

    const updater = this.requireUpdater();
    if (!updater) {
      return this.getStatus();
    }

    try {
      this.updateStatus({ phase: 'downloading', errorMessage: undefined });
      await updater.downloadUpdate();
    } catch (error) {
      this.handleError(error);
    }

    return this.getStatus();
  }

  installDownloadedUpdate(): UpdateStatus {
    if (!this.status.supported || this.status.phase !== 'downloaded') {
      this.emitStatus();
      return this.getStatus();
    }

    const updater = this.requireUpdater();
    updater?.quitAndInstall(false, true);
    return this.getStatus();
  }

  private createInitialStatus(): UpdateStatus {
    const support = detectUpdateSupport({
      platform: process.platform,
      isPackaged: app.isPackaged,
      isDevelopment: Boolean(process.env.ELECTRON_RENDERER_URL),
      appImagePath: process.env.APPIMAGE
    });

    if (!support.supported) {
      return {
        currentVersion: app.getVersion(),
        supported: false,
        phase: 'unsupported',
        reason: support.reason,
        lastCheckedAt: this.preferences.lastCheckedAt
      };
    }

    return {
      currentVersion: app.getVersion(),
      supported: true,
      phase: 'idle',
      lastCheckedAt: this.preferences.lastCheckedAt
    };
  }

  private async configureUpdater(): Promise<void> {
    if (!this.status.supported) {
      return;
    }

    const { autoUpdater } = await import('electron-updater');
    this.updater = autoUpdater;
    this.updater.autoDownload = this.preferences.autoDownload;
    this.updater.autoInstallOnAppQuit = false;

    this.updater.on('checking-for-update', () => {
      this.updateStatus({ phase: 'checking', errorMessage: undefined, progress: undefined });
    });

    this.updater.on('update-available', (info: UpdateInfo) => {
      this.markChecked();
      this.updateStatus({
        phase: 'available',
        availableVersion: info.version,
        errorMessage: undefined,
        progress: undefined
      });
      this.sendEvent(IPC_CHANNELS.updatesAvailable, this.getStatus());
    });

    this.updater.on('update-not-available', () => {
      this.markChecked();
      this.updateStatus({
        phase: 'notAvailable',
        availableVersion: undefined,
        errorMessage: undefined,
        progress: undefined
      });
      this.sendEvent(IPC_CHANNELS.updatesNotAvailable, this.getStatus());
    });

    this.updater.on('download-progress', (progress: ProgressInfo) => {
      this.updateStatus({
        phase: 'downloading',
        progress: {
          percent: Number.isFinite(progress.percent) ? progress.percent : 0,
          transferred: progress.transferred,
          total: progress.total,
          bytesPerSecond: progress.bytesPerSecond
        }
      });
      this.sendEvent(IPC_CHANNELS.updatesDownloadProgress, this.getStatus());
    });

    this.updater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateStatus({
        phase: 'downloaded',
        availableVersion: info.version,
        errorMessage: undefined,
        progress: undefined
      });
      this.sendEvent(IPC_CHANNELS.updatesDownloaded, this.getStatus());
    });

    this.updater.on('error', (error: Error) => {
      this.handleError(error);
    });
  }

  private requireUpdater(): AppUpdater | null {
    if (!this.updater) {
      this.handleError('Update engine is not ready.');
      return null;
    }
    return this.updater;
  }

  private updateStatus(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emitStatus();
  }

  private emitStatus(): void {
    this.sendEvent(IPC_CHANNELS.updatesStatus, this.getStatus());
  }

  private handleError(error: unknown): void {
    this.updateStatus({
      phase: 'error',
      errorMessage: error instanceof Error ? error.message : String(error),
      progress: undefined
    });
    this.sendEvent(IPC_CHANNELS.updatesError, this.getStatus());
  }

  private markChecked(): void {
    this.preferences = {
      ...this.preferences,
      lastCheckedAt: new Date().toISOString()
    };
    this.status = {
      ...this.status,
      lastCheckedAt: this.preferences.lastCheckedAt
    };
    this.writePreferences();
  }

  private readPreferences(): UpdatePreferences {
    try {
      const raw = fs.readFileSync(this.preferencesPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<UpdatePreferences>;
      return {
        autoCheck: typeof parsed.autoCheck === 'boolean' ? parsed.autoCheck : DEFAULT_UPDATE_PREFERENCES.autoCheck,
        autoDownload: typeof parsed.autoDownload === 'boolean' ? parsed.autoDownload : DEFAULT_UPDATE_PREFERENCES.autoDownload,
        lastCheckedAt: typeof parsed.lastCheckedAt === 'string' ? parsed.lastCheckedAt : null
      };
    } catch {
      return { ...DEFAULT_UPDATE_PREFERENCES };
    }
  }

  private writePreferences(): void {
    fs.mkdirSync(path.dirname(this.preferencesPath), { recursive: true });
    fs.writeFileSync(this.preferencesPath, `${JSON.stringify(this.preferences, null, 2)}\n`, 'utf8');
  }
}
