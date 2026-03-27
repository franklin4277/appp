import multer from "multer";

const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

const imageOnly = (_req, file, cb) => {
  const mime = String(file.mimetype || "").toLowerCase();
  if (ALLOWED_IMAGE_MIME.has(mime)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only PNG, JPG, or WEBP images are allowed."));
};

const csvOnly = (_req, file, cb) => {
  const filename = String(file.originalname || "").toLowerCase();
  const isCsvMime = /csv|excel|text\/plain/i.test(file.mimetype || "");
  if (isCsvMime || filename.endsWith(".csv")) {
    cb(null, true);
    return;
  }

  cb(new Error("Only CSV files are allowed for import."));
};

export const uploadTradeScreenshots = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageOnly,
  limits: {
    fileSize: 3 * 1024 * 1024,
    files: 2,
  },
});

export const uploadCsvFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: csvOnly,
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});
