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

  // 2. Define Extensions (CRITICAL FIX)
  const originalExt = path.extname(options.filename).slice(1).toLowerCase() || 'img';

  // LOGIC FLIP: Use original by default. Only convert to webp if optimize is true.
  const optimize = options.optimize === 'true' || options.optimize === true;
  const targetExt = optimize ? 'webp' : originalExt;

  const id = nanoid(12);
  const fileName = `${id}.${targetExt}`;
  const filePath = path.join(fullDirPath, fileName);

  const pipeline = sharp();
  fileStream.pipe(pipeline);

  try {
    const mainProcess = pipeline.clone();

    // Execute save and metadata extraction
    const [saveInfo, rawMetadata] = await Promise.all([
      mainProcess.toFormat(targetExt, { quality: 85 }).toFile(filePath),
      pipeline.metadata()
    ]);

    // 4. Generate Blurhash
    const blurhash = await pipeline.clone()
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3))
      .catch(() => null);

    // 5. Return structured result for DB
    return {
      id,
      relPath: path.join(datePath, fileName).replace(/\\/g, '/'),
      size: saveInfo.size,
      width: rawMetadata.width,
      height: rawMetadata.height,
      targetExt: targetExt,
      originalExt: originalExt,
      blurhash
    };

  } catch (err) {
    try { await fsp.unlink(filePath); } catch (e) { }
    console.error('Storage Engine Internal Error:', err);
    throw err;
  }
};