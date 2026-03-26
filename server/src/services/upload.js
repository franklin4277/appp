import multer from "multer";

const imageOnly = (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
    return;
  }

  cb(new Error("Only image files are allowed."));
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
    fileSize: 5 * 1024 * 1024,
  },
});

export const uploadCsvFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: csvOnly,
  limits: {
    fileSize: 3 * 1024 * 1024,
  },
});
