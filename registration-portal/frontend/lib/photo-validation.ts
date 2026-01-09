/**
 * Photo validation utility for frontend validation
 * Matches backend settings:
 * - Photo: 200-600px dimensions, 2MB max
 * - ID Scan: Any dimensions, 5MB max
 */

export interface PhotoValidationResult {
  isValid: boolean;
  errors: string[];
  dimensions?: { width: number; height: number };
  fileSizeMB?: number;
}

// Photo requirements (from backend settings)
const PHOTO_MIN_WIDTH = 200;
const PHOTO_MAX_WIDTH = 600;
const PHOTO_MIN_HEIGHT = 200;
const PHOTO_MAX_HEIGHT = 600;
const PHOTO_MAX_SIZE = 2 * 1024 * 1024; // 2MB

// ID Scan requirements
const ID_SCAN_MAX_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png"];

/**
 * Validate image dimensions by loading the image
 */
function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Validate passport photograph
 * Requirements: 200-600px dimensions, 2MB max, JPEG/PNG
 */
export async function validatePassportPhoto(file: File): Promise<PhotoValidationResult> {
  const errors: string[] = [];
  const fileSizeMB = file.size / (1024 * 1024);

  // Check file type
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    errors.push(`File must be JPEG or PNG format. Got: ${file.type || "unknown"}`);
    return { isValid: false, errors, fileSizeMB };
  }

  // Check file size
  if (file.size > PHOTO_MAX_SIZE) {
    errors.push(
      `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (2MB)`
    );
  }

  // Check dimensions
  try {
    const { width, height } = await getImageDimensions(file);

    if (width < PHOTO_MIN_WIDTH || height < PHOTO_MIN_HEIGHT) {
      errors.push(
        `Image dimensions (${width}x${height}px) are too small. Minimum required: ${PHOTO_MIN_WIDTH}x${PHOTO_MIN_HEIGHT}px`
      );
    }

    if (width > PHOTO_MAX_WIDTH || height > PHOTO_MAX_HEIGHT) {
      errors.push(
        `Image dimensions (${width}x${height}px) are too large. Maximum allowed: ${PHOTO_MAX_WIDTH}x${PHOTO_MAX_HEIGHT}px`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      dimensions: { width, height },
      fileSizeMB,
    };
  } catch (error) {
    errors.push("Failed to read image dimensions. Please ensure the file is a valid image.");
    return { isValid: false, errors, fileSizeMB };
  }
}

/**
 * Validate National ID scan
 * Requirements: Any dimensions, 5MB max, JPEG/PNG
 */
export async function validateIdScan(file: File): Promise<PhotoValidationResult> {
  const errors: string[] = [];
  const fileSizeMB = file.size / (1024 * 1024);

  // Check file type
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    errors.push(`File must be JPEG or PNG format. Got: ${file.type || "unknown"}`);
    return { isValid: false, errors, fileSizeMB };
  }

  // Check file size
  if (file.size > ID_SCAN_MAX_SIZE) {
    errors.push(
      `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (5MB)`
    );
  }

  // Get dimensions for display (not validated)
  try {
    const { width, height } = await getImageDimensions(file);
    return {
      isValid: errors.length === 0,
      errors,
      dimensions: { width, height },
      fileSizeMB,
    };
  } catch (error) {
    errors.push("Failed to read image. Please ensure the file is a valid image.");
    return { isValid: false, errors, fileSizeMB };
  }
}
