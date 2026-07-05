import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

export type ImageAnalysis = {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  isAnimated: boolean;
  hasTransparency: boolean;
  colors: Array<{ color: string; population: number; sortOrder: number }>;
};

export type VideoMetadata = {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  warnings: string[];
};

export type VideoThumbnailResult = {
  created: boolean;
  warnings: string[];
};

const MEDIA_PROCESS_TIMEOUT_MS = 15_000;
const VIDEO_PROCESS_CONCURRENCY = 2;
let activeVideoProcesses = 0;
const videoProcessQueue: Array<() => void> = [];

export class MediaService {
  async analyzeImage(filePath: string): Promise<ImageAnalysis> {
    const image = sharp(filePath, { animated: false, limitInputPixels: false });
    const metadata = await image.metadata();
    const palette = await this.extractPalette(filePath);

    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      durationMs: null,
      isAnimated: Boolean(metadata.pages && metadata.pages > 1),
      hasTransparency: Boolean(metadata.hasAlpha || palette.hasTransparency),
      colors: palette.colors,
    };
  }

  async createThumbnail(sourcePath: string, targetPath: string, size: number): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await sharp(sourcePath, { animated: false, limitInputPixels: false })
      .rotate()
      .resize({
        width: size,
        height: size,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 84 })
      .toFile(targetPath);
  }

  async createPreview(sourcePath: string, targetPath: string, size: number): Promise<void> {
    await this.createThumbnail(sourcePath, targetPath, Math.max(size, 960));
  }

  async analyzeVideo(filePath: string, ffprobePath?: string): Promise<VideoMetadata> {
    const executable = resolveExecutable(ffprobePath, 'FFPROBE_PATH', 'ffprobe');
    const result = await runLimitedVideoProcess(() =>
      runProcess(executable, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath])
    );

    if (!result.ok) {
      return {
        width: null,
        height: null,
        durationMs: null,
        warnings: [`Video metadata unavailable: ${result.error}`]
      };
    }

    try {
      const payload = JSON.parse(result.stdout) as {
        streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
        format?: { duration?: string };
      };
      const videoStream = payload.streams?.find((stream) => stream.codec_type === 'video') ?? payload.streams?.[0];
      const durationSeconds = Number(videoStream?.duration ?? payload.format?.duration ?? 0);
      return {
        width: Number.isFinite(videoStream?.width) ? videoStream?.width ?? null : null,
        height: Number.isFinite(videoStream?.height) ? videoStream?.height ?? null : null,
        durationMs: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds * 1000) : null,
        warnings: []
      };
    } catch (error) {
      return {
        width: null,
        height: null,
        durationMs: null,
        warnings: [`Video metadata parse failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  async createVideoThumbnail(
    sourcePath: string,
    targetPath: string,
    size: number,
    input: { ffmpegPath?: string; durationMs?: number | null } = {}
  ): Promise<VideoThumbnailResult> {
    const executable = resolveExecutable(input.ffmpegPath, 'FFMPEG_PATH', 'ffmpeg');
    const tempPngPath = `${targetPath}.png`;
    const seekSeconds = input.durationMs && input.durationMs < 1500 ? 0 : 1;
    const args = [
      '-y',
      '-ss',
      String(seekSeconds),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
      tempPngPath
    ];

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const result = await runLimitedVideoProcess(() => runProcess(executable, args));
    if (!result.ok) {
      await fs.rm(tempPngPath, { force: true });
      return { created: false, warnings: [`Video thumbnail unavailable: ${result.error}`] };
    }

    try {
      await sharp(tempPngPath, { limitInputPixels: false }).webp({ quality: 84 }).toFile(targetPath);
      return { created: true, warnings: [] };
    } catch (error) {
      return {
        created: false,
        warnings: [`Video thumbnail conversion failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    } finally {
      await fs.rm(tempPngPath, { force: true });
    }
  }

  private async extractPalette(filePath: string): Promise<{
    colors: Array<{ color: string; population: number; sortOrder: number }>;
    hasTransparency: boolean;
  }> {
    const { data } = await sharp(filePath, { animated: false, limitInputPixels: false })
      .resize({ width: 72, height: 72, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const counts = new Map<string, number>();
    let hasTransparency = false;

    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 250) {
        hasTransparency = true;
      }
      if (alpha < 12) {
        continue;
      }

      const red = quantize(data[index]);
      const green = quantize(data[index + 1]);
      const blue = quantize(data[index + 2]);
      const color = toHex(red, green, blue);
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }

    const colors = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([color, population], sortOrder) => ({ color, population, sortOrder }));

    return { colors, hasTransparency };
  }
}

async function runLimitedVideoProcess<T>(task: () => Promise<T>): Promise<T> {
  if (activeVideoProcesses >= VIDEO_PROCESS_CONCURRENCY) {
    await new Promise<void>((resolve) => videoProcessQueue.push(resolve));
  }
  activeVideoProcesses += 1;
  try {
    return await task();
  } finally {
    activeVideoProcesses -= 1;
    const next = videoProcessQueue.shift();
    if (next) {
      next();
    }
  }
}

function resolveExecutable(configuredPath: string | undefined, envKey: string, fallback: string): string {
  return configuredPath?.trim() || process.env[envKey]?.trim() || fallback;
}

function runProcess(
  command: string,
  args: string[]
): Promise<{ ok: true; stdout: string; stderr: string } | { ok: false; stdout: string; stderr: string; error: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGKILL');
      resolve({ ok: false, stdout, stderr, error: `Timed out after ${MEDIA_PROCESS_TIMEOUT_MS}ms` });
    }, MEDIA_PROCESS_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ ok: false, stdout, stderr, error: error.message });
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ ok: true, stdout, stderr });
      } else {
        resolve({ ok: false, stdout, stderr, error: stderr.trim() || `Process exited with code ${code ?? 'unknown'}` });
      }
    });
  });
}

function quantize(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
}

function toHex(red: number, green: number, blue: number): string {
  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue
    .toString(16)
    .padStart(2, '0')}`;
}
