import path from 'node:path';
import fsp from 'node:fs/promises';
import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { encode } from 'blurhash';

export const saveImage = async (fileStream, options, config) => {
  // 1. Setup Paths
  const now = new Date();
  const datePath = path.join(
    now.getFullYear().toString(),
    (now.getMonth() + 1).toString().padStart(2, '0'),
    now.getDate().toString().padStart(2, '0')
  );

  const fullDirPath = path.resolve(config.storage.base_path || './uploads', datePath);
  await fsp.mkdir(fullDirPath, { recursive: true });

  const id = nanoid(12);
  const targetExt = options.convert || options.format || config.image_defaults.default_format || 'webp';
  const quality = parseInt(options.quality) || config.image_defaults.default_quality || 80;
  const fileName = `${id}.${targetExt}`;
  const filePath = path.join(fullDirPath, fileName);

  // 2. Setup Sharp Pipeline
  const pipeline = sharp();
  fileStream.pipe(pipeline);

  try {
    const mainProcess = pipeline.clone();

    if (options.width || options.height) {
      mainProcess.resize({
        width: options.width ? parseInt(options.width) : null,
        height: options.height ? parseInt(options.height) : null,
        withoutEnlargement: true,
        fit: 'inside'
      });
    }

    // FIX: Variable name alignment (saveInfo used here and in return object)
    const [saveInfo, rawMetadata] = await Promise.all([
      mainProcess.toFormat(targetExt, { quality }).toFile(filePath),
      pipeline.metadata()
    ]);

    // 3. Generate Blurhash
    const blurhash = await pipeline.clone()
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3))
      .catch(err => {
        console.error('Blurhash Generation Failed:', err.message);
        return null;
      });

    // 4. Return formatted result
    return {
      id,
      relPath: path.join(datePath, fileName).replace(/\\/g, '/'),
      size: saveInfo.size,   // Linked to saveInfo above
      width: saveInfo.width, // Linked to saveInfo above
      height: saveInfo.height,
      ext: targetExt,
      blurhash,
      metadata: JSON.stringify({
        original_format: rawMetadata.format,
        space: rawMetadata.space,
        density: rawMetadata.density
      })
    };

  } catch (err) {
    // Cleanup partial file on error
    try { await fsp.unlink(filePath); } catch (e) { }
    console.error('Storage Engine Error:', err);
    throw err;
  }
};