import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { encode } from 'blurhash';

export const saveImage = async (fileStream, options, config) => {
  const now = new Date();
  const datePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const fullDirPath = path.join(config.storage.base_path || './storage', datePath);
  
  await fs.mkdir(fullDirPath, { recursive: true });

  const id = nanoid(12);
  // Support both ?convert= and ?format= params, fallback to default
  const targetExt = options.convert || options.format || config.image_defaults.default_format;
  const quality = parseInt(options.quality) || config.image_defaults.default_quality;
  const fileName = `${id}.${targetExt}`;
  const filePath = path.join(fullDirPath, fileName);

  // Initialize master pipeline
  const pipeline = sharp();
  fileStream.pipe(pipeline);

  // Clone 1: Process and save to disk
  let saveClone = pipeline.clone();
  if (options.width) {
    saveClone = saveClone.resize({ width: parseInt(options.width), withoutEnlargement: true });
  }
  const savePromise = saveClone.toFormat(targetExt, { quality }).toFile(filePath);

  // Clone 2: Generate Blurhash (small 32x32 raw buffer)
  const blurPromise = pipeline.clone()
    .resize(32, 32, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3))
    .catch((err) => {
      console.error('Blurhash generation failed:', err.message);
      return null;
    });

  // Execute both pipelines simultaneously
  const [saveInfo, blurhash] = await Promise.all([savePromise, blurPromise]);

  return {
    id,
    path: `${datePath}/${fileName}`,
    size: saveInfo.size,
    width: saveInfo.width,
    height: saveInfo.height,
    ext: targetExt,
    blurhash
  };
};