import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../../uploads");

const isCloudinaryEnabled = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

let cloudinaryConfigured = false;

const configureCloudinary = () => {
  if (cloudinaryConfigured || !isCloudinaryEnabled()) {
    return;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  cloudinaryConfigured = true;
};

const sanitizeBaseName = (name = "") =>
  name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 40) || "image";

const localPathToUrl = (filepath) => filepath.replace(/\\/g, "/");

const saveLocalFile = async (file) => {
  await fs.mkdir(uploadsDir, { recursive: true });
  const ext = path.extname(file.originalname || "").toLowerCase() || ".png";
  const filename = `${Date.now()}-${sanitizeBaseName(file.originalname || "screenshot")}${ext}`;
  const target = path.join(uploadsDir, filename);
  await fs.writeFile(target, file.buffer);
  return {
    provider: "local",
    path: localPathToUrl(path.join("uploads", filename)),
  };
};

const uploadCloudinary = (file) =>
  new Promise((resolve, reject) => {
    configureCloudinary();
    const folder = process.env.CLOUDINARY_FOLDER || "trading-journal";
    const publicId = `${Date.now()}-${sanitizeBaseName(file.originalname || "screenshot")}`;
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        public_id: publicId,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({
          provider: "cloudinary",
          path: result.secure_url,
        });
      }
    );

    Readable.from(file.buffer).pipe(stream);
  });

export const storeScreenshot = async (file) => {
  if (!file) {
    return {
      provider: "",
      path: "",
    };
  }

  if (isCloudinaryEnabled()) {
    try {
      return await uploadCloudinary(file);
    } catch (error) {
      console.warn("Cloud upload failed, falling back to local storage:", error.message);
    }
  }

  return saveLocalFile(file);
};

export const formatStoredFileUrl = (req, pathOrUrl = "") => {
  if (!pathOrUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${req.protocol}://${req.get("host")}/${pathOrUrl.replace(/\\/g, "/")}`;
};

