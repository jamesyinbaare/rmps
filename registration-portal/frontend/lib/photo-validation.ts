/**
 * Photo validation utility for frontend validation.
 * Matches backend: candidate (exact dimensions), certificate_request_photo (exact dimensions), national_id (file type + max size only).
 * Config can be fetched from GET /api/v1/public/photo-validation-config or passed in.
 */

export interface PhotoValidationResult {
  isValid: boolean;
  errors: string[];
  dimensions?: { width: number; height: number };
  fileSizeMB?: number;
}

export interface PhotoValidationConfig {
  candidate: { width: number; height: number };
  certificate_request_photo: { width: number; height: number };
  national_id_max_file_size: number;
}

// Defaults (match backend defaults when config not yet loaded)
const DEFAULT_CONFIG: PhotoValidationConfig = {
  candidate: { width: 155, height: 191 },
  certificate_request_photo: { width: 600, height: 600 },
  national_id_max_file_size: 5 * 1024 * 1024, // 5MB
};

let cachedConfig: PhotoValidationConfig | null = null;

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png"];

/**
 * Fetch photo validation config from the public API. Result is cached.
 */
export async function getPhotoValidationConfig(): Promise<PhotoValidationConfig> {
  if (cachedConfig) return cachedConfig;
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const response = await fetch(`${API_BASE_URL}/api/v1/public/photo-validation-config`);
  if (!response.ok) return DEFAULT_CONFIG;
  const data = await response.json();
  cachedConfig = {
    candidate: data.candidate ?? DEFAULT_CONFIG.candidate,
    certificate_request_photo: data.certificate_request_photo ?? DEFAULT_CONFIG.certificate_request_photo,
    national_id_max_file_size: data.national_id_max_file_size ?? DEFAULT_CONFIG.national_id_max_file_size,
  };
  return cachedConfig;
}

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
 * Validate candidate passport photo.
 * Requirements: exact width x height (from config, e.g. 155x191), 2MB max, JPEG/PNG.
 * Used by: school photo album, registration, bulk photo validation UI.
 */
export async function validatePassportPhoto(
  file: File,
  config?: PhotoValidationConfig | null
): Promise<PhotoValidationResult> {
  const cfg = config ?? cachedConfig ?? DEFAULT_CONFIG;
  const requiredWidth = cfg.candidate.width;
  const requiredHeight = cfg.candidate.height;
  const maxSize = 2 * 1024 * 1024; // 2MB for candidate photos
  const errors: string[] = [];
  const fileSizeMB = file.size / (1024 * 1024);

  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    errors.push(`File must be JPEG or PNG format. Got: ${file.type || "unknown"}`);
    return { isValid: false, errors, fileSizeMB };
  }

  if (file.size > maxSize) {
    errors.push(
      `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (2MB)`
    );
  }

  try {
    const { width, height } = await getImageDimensions(file);
    if (width !== requiredWidth || height !== requiredHeight) {
      errors.push(
        `Image dimensions must be exactly ${requiredWidth}x${requiredHeight} pixels. Got: ${width}x${height} pixels`
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
 * Validate certificate request photograph.
 * Requirements: exact width x height (from config, e.g. 600x600), 2MB max, JPEG/PNG.
 * Used by: certificate request page for the photograph.
 */
export async function validateCertificateRequestPhoto(
  file: File,
  config?: PhotoValidationConfig | null
): Promise<PhotoValidationResult> {
  const cfg = config ?? cachedConfig ?? DEFAULT_CONFIG;
  const requiredWidth = cfg.certificate_request_photo.width;
  const requiredHeight = cfg.certificate_request_photo.height;
  const maxSize = 2 * 1024 * 1024; // 2MB
  const errors: string[] = [];
  const fileSizeMB = file.size / (1024 * 1024);

  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    errors.push(`File must be JPEG or PNG format. Got: ${file.type || "unknown"}`);
    return { isValid: false, errors, fileSizeMB };
  }

  if (file.size > maxSize) {
    errors.push(
      `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (2MB)`
    );
  }

  try {
    const { width, height } = await getImageDimensions(file);
    if (width !== requiredWidth || height !== requiredHeight) {
      errors.push(
        `Image dimensions must be exactly ${requiredWidth}x${requiredHeight} pixels. Got: ${width}x${height} pixels`
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
 * Validate National ID scan (and other document scans).
 * Requirements: any dimensions; file type JPEG/PNG and max file size only (e.g. 5MB).
 */
export async function validateIdScan(
  file: File,
  config?: PhotoValidationConfig | null
): Promise<PhotoValidationResult> {
  const cfg = config ?? cachedConfig ?? DEFAULT_CONFIG;
  const maxSize = cfg.national_id_max_file_size;
  const maxSizeMB = maxSize / (1024 * 1024);
  const errors: string[] = [];
  const fileSizeMB = file.size / (1024 * 1024);

  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    errors.push(`File must be JPEG or PNG format. Got: ${file.type || "unknown"}`);
    return { isValid: false, errors, fileSizeMB };
  }

  if (file.size > maxSize) {
    errors.push(
      `File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum allowed size (${maxSizeMB}MB)`
    );
  }

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
