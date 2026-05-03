import { v2 as cloudinary } from 'cloudinary';
import { assertPublicUrl } from './safeUrl';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('[cloudinary] config incomplete — image uploads will fail');
}

export async function uploadImageFromUrl(sourceUrl: string): Promise<string> {
  await assertPublicUrl(sourceUrl);
  const result = await cloudinary.uploader.upload(sourceUrl, {
    folder: 'wp-autopublish',
    resource_type: 'image',
  });
  return result.secure_url;
}

export async function uploadImageFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: 'wp-autopublish', resource_type: 'image', public_id: filename },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve(result.secure_url);
        },
      )
      .end(buffer);
  });
}
