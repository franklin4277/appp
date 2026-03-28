const DEFAULT_MAX_DIMENSION = 1680;
const DEFAULT_TARGET_BYTES = 900 * 1024;
const DEFAULT_INITIAL_QUALITY = 0.84;
const DEFAULT_MIN_QUALITY = 0.56;
const DEFAULT_QUALITY_STEP = 0.08;

const safeNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isCompressibleImage = (file) => {
  const type = String(file?.type || "").toLowerCase();
  return type === "image/jpeg" || type === "image/jpg" || type === "image/png" || type === "image/webp";
};

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    if (!canvas?.toBlob) {
      reject(new Error("Canvas blob conversion is not supported in this browser."));
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed to produce output."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });

const loadBitmapFromFile = async (file) => {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  if (typeof URL === "undefined" || typeof Image === "undefined") {
    throw new Error("Image APIs are unavailable.");
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode image file."));
    };
    image.src = objectUrl;
  });
};

const scaledDimensions = (width, height, maxDimension) => {
  if (!width || !height) {
    return { width: 0, height: 0, scale: 1 };
  }

  const maxSide = Math.max(width, height);
  if (maxSide <= maxDimension) {
    return {
      width,
      height,
      scale: 1,
    };
  }

  const scale = maxDimension / maxSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
};

const buildCompressedFileName = (originalName = "", extension = "jpg") => {
  const source = String(originalName || "").trim();
  if (!source) {
    return `screenshot.${extension}`;
  }

  const stripped = source.replace(/\.[^.]+$/, "");
  return `${stripped}.${extension}`;
};

export const compressImageFile = async (file, options = {}) => {
  if (!file || typeof File === "undefined" || !(file instanceof File) || !isCompressibleImage(file)) {
    return {
      file,
      compressed: false,
      originalBytes: Number(file?.size || 0),
      outputBytes: Number(file?.size || 0),
    };
  }

  if (typeof document === "undefined") {
    return {
      file,
      compressed: false,
      originalBytes: file.size,
      outputBytes: file.size,
    };
  }

  const maxDimension = safeNumber(options.maxDimension, DEFAULT_MAX_DIMENSION);
  const targetBytes = safeNumber(options.targetBytes, DEFAULT_TARGET_BYTES);
  const initialQuality = Math.min(1, Math.max(0.4, safeNumber(options.initialQuality, DEFAULT_INITIAL_QUALITY)));
  const minQuality = Math.min(initialQuality, Math.max(0.3, safeNumber(options.minQuality, DEFAULT_MIN_QUALITY)));
  const qualityStep = Math.min(0.2, Math.max(0.02, safeNumber(options.qualityStep, DEFAULT_QUALITY_STEP)));

  let bitmap = null;

  try {
    bitmap = await loadBitmapFromFile(file);
    const sourceWidth = Number(bitmap.width || 0);
    const sourceHeight = Number(bitmap.height || 0);
    const nextSize = scaledDimensions(sourceWidth, sourceHeight, maxDimension);

    const needsResize = nextSize.scale < 1;
    const needsCompression = file.size > targetBytes;

    if (!needsResize && !needsCompression) {
      return {
        file,
        compressed: false,
        originalBytes: file.size,
        outputBytes: file.size,
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = nextSize.width || sourceWidth;
    canvas.height = nextSize.height || sourceHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      return {
        file,
        compressed: false,
        originalBytes: file.size,
        outputBytes: file.size,
      };
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    let outputType = "image/jpeg";
    if (String(file.type || "").toLowerCase() === "image/webp") {
      outputType = "image/webp";
    }

    let quality = initialQuality;
    let blob = await canvasToBlob(canvas, outputType, quality);

    while (blob.size > targetBytes && quality > minQuality) {
      quality = Math.max(minQuality, quality - qualityStep);
      blob = await canvasToBlob(canvas, outputType, quality);
      if (quality === minQuality) {
        break;
      }
    }

    const meaningfulShrink = blob.size < file.size * 0.96;
    if (!needsResize && !meaningfulShrink) {
      return {
        file,
        compressed: false,
        originalBytes: file.size,
        outputBytes: file.size,
      };
    }

    const extension = outputType === "image/webp" ? "webp" : "jpg";
    const optimized = new File([blob], buildCompressedFileName(file.name, extension), {
      type: outputType,
      lastModified: Date.now(),
    });

    return {
      file: optimized,
      compressed: true,
      originalBytes: file.size,
      outputBytes: optimized.size,
    };
  } catch {
    return {
      file,
      compressed: false,
      originalBytes: Number(file.size || 0),
      outputBytes: Number(file.size || 0),
    };
  } finally {
    if (bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
};

export const formatBytes = (value = 0) => {
  const bytes = Math.max(Number(value) || 0, 0);
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  }
  return `${Math.round((bytes / (1024 * 1024)) * 100) / 100} MB`;
};
