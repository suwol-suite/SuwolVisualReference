import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export type ImageAnalysis = {
  width: number | null;
  height: number | null;
  hasTransparency: boolean;
  colors: Array<{ color: string; population: number; sortOrder: number }>;
};

export class MediaService {
  async analyzeImage(filePath: string): Promise<ImageAnalysis> {
    const image = sharp(filePath, { animated: false, limitInputPixels: false });
    const metadata = await image.metadata();
    const palette = await this.extractPalette(filePath);

    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      hasTransparency: Boolean(metadata.hasAlpha),
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

function quantize(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 32) * 32));
}

function toHex(red: number, green: number, blue: number): string {
  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue
    .toString(16)
    .padStart(2, '0')}`;
}
