/**
 * config/cloudinary.js
 * Initialises and exports a single Cloudinary v2 client instance.
 * Credentials are read from environment variables — never hardcoded.
 */

import { v2 as cloudinary } from "cloudinary";

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY    ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.warn(
    "[cloudinary] WARNING: One or more Cloudinary env vars are missing. " +
    "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

export default cloudinary;