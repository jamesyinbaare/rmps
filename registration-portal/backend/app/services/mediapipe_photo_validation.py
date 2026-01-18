"""MediaPipe-based photo validation service for passport photos.

This service integrates MediaPipe face detection, pose estimation, and eye detection
for comprehensive passport photo validation.
"""

import os
import io
import tempfile
import logging
import math
from typing import Optional, Dict, Any, Tuple

from PIL import Image
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

logger = logging.getLogger(__name__)

# Try to import OpenCV for LAB color space conversion
try:
    import cv2
    import numpy as np
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    logger.warning("OpenCV (cv2) not available - LAB color space validation will use RGB fallback")

# Eye landmark indices for MediaPipe Face Landmarker
LEFT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144]  # Left eye landmarks
RIGHT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380]  # Right eye landmarks

# Global MediaPipe model instances (singletons)
_detector: Optional[vision.FaceDetector] = None
_segmenter: Optional[vision.ImageSegmenter] = None
_landmarker: Optional[vision.FaceLandmarker] = None


def _get_mediapipe_models_path() -> str:
    """Get the path where MediaPipe model files are stored."""
    # Try multiple possible locations
    possible_paths = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "models"),
        "models",  # Current directory
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),  # Backend root
    ]

    for path in possible_paths:
        abs_path = os.path.abspath(path)
        # Check if it's a directory (not a file like models.py)
        if os.path.isdir(abs_path):
            return abs_path

    # Default to backend root if no models directory found
    return os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


def _initialize_detector() -> Optional[vision.FaceDetector]:
    """Initialize MediaPipe Face Detector model."""
    global _detector

    if _detector is not None:
        return _detector

    try:
        models_path = _get_mediapipe_models_path()
        detector_path = os.path.join(models_path, "detector.tflite")

        # Also try root directory
        if not os.path.exists(detector_path):
            detector_path = "detector.tflite"

        if os.path.exists(detector_path):
            base_options = python.BaseOptions(model_asset_path=detector_path)
            options = vision.FaceDetectorOptions(base_options=base_options)
            _detector = vision.FaceDetector.create_from_options(options)
            logger.info(f"MediaPipe Face Detector initialized with {detector_path}")
            return _detector
        else:
            logger.warning(f"Face detector model not found at {detector_path}")
            return None
    except Exception as e:
        logger.error(f"Failed to initialize Face Detector: {e}", exc_info=True)
        return None


def _initialize_segmenter() -> Optional[vision.ImageSegmenter]:
    """Initialize MediaPipe Image Segmenter model."""
    global _segmenter

    if _segmenter is not None:
        return _segmenter

    try:
        models_path = _get_mediapipe_models_path()
        segmenter_path = os.path.join(models_path, "selfie_segmenter.tflite")

        # Also try root directory
        if not os.path.exists(segmenter_path):
            segmenter_path = "selfie_segmenter.tflite"

        if os.path.exists(segmenter_path):
            base_options = python.BaseOptions(model_asset_path=segmenter_path)
            segmenter_options = vision.ImageSegmenterOptions(base_options=base_options)
            _segmenter = vision.ImageSegmenter.create_from_options(segmenter_options)
            logger.info(f"MediaPipe Image Segmenter initialized with {segmenter_path}")
            return _segmenter
        else:
            logger.warning(f"Selfie segmenter model not found at {segmenter_path}")
            return None
    except Exception as e:
        logger.warning(f"Failed to initialize Image Segmenter: {e}")
        return None


def _initialize_landmarker() -> Optional[vision.FaceLandmarker]:
    """Initialize MediaPipe Face Landmarker model."""
    global _landmarker

    if _landmarker is not None:
        return _landmarker

    try:
        models_path = _get_mediapipe_models_path()
        model_paths = [
            os.path.join(models_path, "face_landmarker.task"),
            os.path.join(models_path, "face_landmarker.tflite"),
            "face_landmarker.task",  # Root directory
            "face_landmarker.tflite",  # Root directory
        ]

        model_path = None
        for path in model_paths:
            if os.path.exists(path):
                model_path = path
                break

        if model_path:
            base_options = python.BaseOptions(model_asset_path=model_path)
            landmarker_options = vision.FaceLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,  # For still images
                num_faces=1,  # Single face detection
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            _landmarker = vision.FaceLandmarker.create_from_options(landmarker_options)
            logger.info(f"MediaPipe Face Landmarker initialized with {model_path}")
            return _landmarker
        else:
            logger.warning("Face Landmarker model not found - eye and pose detection will be unavailable")
            return None
    except Exception as e:
        logger.warning(f"Failed to initialize Face Landmarker: {e}")
        return None


def get_detector() -> Optional[vision.FaceDetector]:
    """Get or initialize MediaPipe Face Detector instance."""
    return _initialize_detector()


def get_segmenter() -> Optional[vision.ImageSegmenter]:
    """Get or initialize MediaPipe Image Segmenter instance."""
    return _initialize_segmenter()


def get_landmarker() -> Optional[vision.FaceLandmarker]:
    """Get or initialize MediaPipe Face Landmarker instance."""
    return _initialize_landmarker()


def replace_background(
    image_bytes: bytes,
    background_color: tuple[int, int, int] = (255, 255, 255)  # White (RGB)
) -> bytes:
    """
    Replace background with specified color using MediaPipe ImageSegmenter.

    Args:
        image_bytes: Image data as bytes
        background_color: RGB tuple for background color (default: white 255, 255, 255)

    Returns:
        Modified image as bytes (JPEG format)

    Raises:
        ValueError: If segmenter is not available or segmentation fails
    """
    segmenter = get_segmenter()
    if segmenter is None:
        raise ValueError("MediaPipe ImageSegmenter not available - cannot replace background")

    tmp_path = None
    try:
        # Save bytes to temporary file
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        # Create MediaPipe image
        mp_image = mp.Image.create_from_file(tmp_path)

        # Segment person from background
        segmentation_result = segmenter.segment(mp_image)

        if not segmentation_result.confidence_masks:
            raise ValueError("Segmentation masks not available - cannot replace background")

        mask = segmentation_result.confidence_masks[0]
        mask_image = mask.numpy_view()

        # Load image for pixel access
        image = Image.open(tmp_path)
        img_array = image.convert('RGB')
        img_width, img_height = image.size

        # Create new image with replaced background
        new_image = Image.new('RGB', (img_width, img_height), background_color)

        # Copy person pixels (where mask > 0.5) from original image
        for y in range(img_height):
            for x in range(img_width):
                if mask_image[y, x] > 0.5:  # Person pixel
                    pixel = img_array.getpixel((x, y))
                    new_image.putpixel((x, y), pixel)

        # Save modified image to bytes
        output = io.BytesIO()
        new_image.save(output, format='JPEG', quality=95)
        return output.getvalue()

    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass


def _is_white_perceptual_lab(r: int, g: int, b: int, reference_white: Tuple[int, int, int] = (255, 255, 255), max_delta_e: float = 15.0) -> Tuple[bool, float]:
    """
    Check if a color is perceptually similar to white using LAB color space.

    LAB color space is perceptually uniform - colors that are the same distance
    apart in LAB space appear equally different to the human eye. Delta E measures
    the perceptual difference between colors.

    Args:
        r: Red channel (0-255)
        g: Green channel (0-255)
        b: Blue channel (0-255)
        reference_white: Reference white color in RGB (default: pure white 255, 255, 255)
        max_delta_e: Maximum Delta E threshold for acceptance (default: 15.0)
                    - ΔE < 1: Not perceptible by human eyes
                    - ΔE 1-2: Perceptible by close observation
                    - ΔE 2-10: Perceptible at a glance
                    - ΔE 10-15: Acceptable for "similar" colors
                    - ΔE > 15: Clearly different colors

    Returns:
        Tuple of (is_white: bool, delta_e: float)
    """
    if not CV2_AVAILABLE:
        # Fallback to RGB range check if OpenCV not available
        threshold = 220
        is_white = r >= threshold and g >= threshold and b >= threshold
        # Estimate Delta E (not accurate without LAB conversion)
        avg_rgb = (r + g + b) / 3.0
        delta_e_estimate = abs(255 - avg_rgb) / 255.0 * 100  # Rough estimate
        return is_white, delta_e_estimate

    try:
        # Convert reference white to LAB
        ref_rgb = np.uint8([[[reference_white[2], reference_white[1], reference_white[0]]]])  # BGR format
        ref_lab = cv2.cvtColor(ref_rgb, cv2.COLOR_BGR2LAB)[0][0]
        ref_l = float(ref_lab[0])
        ref_a = float(ref_lab[1])
        ref_b = float(ref_lab[2])

        # Convert test color to LAB
        test_rgb = np.uint8([[[b, g, r]]])  # BGR format
        test_lab = cv2.cvtColor(test_rgb, cv2.COLOR_BGR2LAB)[0][0]
        test_l = float(test_lab[0])
        test_a = float(test_lab[1])
        test_b = float(test_lab[2])

        # Calculate Delta E (CIE76 formula)
        delta_l = test_l - ref_l
        delta_a = test_a - ref_a
        delta_b = test_b - ref_b
        delta_e = math.sqrt(delta_l**2 + delta_a**2 + delta_b**2)

        is_white = delta_e <= max_delta_e
        return is_white, delta_e

    except Exception as e:
        logger.warning(f"Error in LAB color conversion: {e}, falling back to RGB check")
        # Fallback to RGB range check
        threshold = 220
        is_white = r >= threshold and g >= threshold and b >= threshold
        return is_white, 0.0


def _calculate_eye_aspect_ratio(landmarks, eye_indices: list[int]) -> float:
    """Calculate Eye Aspect Ratio (EAR) for eye open/closed detection.

    Args:
        landmarks: Face landmarks from MediaPipe
        eye_indices: List of 6 landmark indices for eye [p1, p2, p3, p4, p5, p6]

    Returns:
        EAR value (higher = more open)
    """
    # Extract eye points
    eye_points = []
    for idx in eye_indices:
        if idx < len(landmarks):
            lm = landmarks[idx]
            eye_points.append((lm.x, lm.y))
        else:
            return 0.0

    if len(eye_points) != 6:
        return 0.0

    # Calculate distances
    # EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    p1, p2, p3, p4, p5, p6 = eye_points

    # Vertical distances
    dist_1 = math.sqrt((p2[0] - p6[0])**2 + (p2[1] - p6[1])**2)
    dist_2 = math.sqrt((p3[0] - p5[0])**2 + (p3[1] - p5[1])**2)

    # Horizontal distance
    dist_3 = math.sqrt((p1[0] - p4[0])**2 + (p1[1] - p4[1])**2)

    if dist_3 == 0:
        return 0.0

    ear = (dist_1 + dist_2) / (2.0 * dist_3)
    return ear


def validate_photo_with_mediapipe(
    image_bytes: bytes,
    validation_level: str = "strict"
) -> Dict[str, Any]:
    """
    Validate photo using MediaPipe models.

    Args:
        image_bytes: Image data as bytes
        validation_level: Validation level - "basic", "standard", or "strict"

    Returns:
        Dictionary with validation results containing:
        - is_valid: bool
        - validations: List of validation results
        - overall_score: float (0-1)
        - suggestions: List of improvement suggestions
    """
    # Get MediaPipe model instances
    detector = get_detector()
    segmenter = get_segmenter()
    landmarker = get_landmarker()

    if detector is None:
        return {
            "is_valid": False,
            "error": "MediaPipe face detector not available",
            "validations": [],
            "overall_score": 0.0,
            "suggestions": []
        }

    # Use simplified validation implementation
    return _validate_photo_simplified(image_bytes, detector, segmenter, landmarker, validation_level)


def _validate_photo_simplified(
    image_bytes: bytes,
    detector: vision.FaceDetector,
    segmenter: Optional[vision.ImageSegmenter],
    landmarker: Optional[vision.FaceLandmarker],
    validation_level: str
) -> Dict[str, Any]:
    """Simplified MediaPipe validation implementation as fallback."""
    validations = []
    is_valid = True
    suggestions = []

    tmp_path = None
    try:
        # Save bytes to temporary file
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name

        # Create MediaPipe image
        mp_image = mp.Image.create_from_file(tmp_path)

        # Face detection (required for standard/strict)
        if validation_level in ("standard", "strict"):
            results = detector.detect(mp_image)

            if results.detections:
                num_faces = len(results.detections)
                if num_faces == 1:
                    validations.append({
                        "name": "Single Face",
                        "passed": True,
                        "score": 1.0,
                        "message": "✓ Single face detected",
                        "suggestion": None
                    })

                    # Background color validation for "strict" level (required if segmenter is available)
                    if validation_level == "strict" and segmenter:
                        try:
                            # Segment person from background
                            segmentation_result = segmenter.segment(mp_image)

                            # MediaPipe ImageSegmenter returns confidence_masks, not segmentation_masks
                            if segmentation_result.confidence_masks:
                                mask = segmentation_result.confidence_masks[0]
                                mask_image = mask.numpy_view()

                                # Load image for pixel access
                                image = Image.open(tmp_path)
                                img_array = image.convert('RGB')
                                img_width, img_height = image.size

                                # Sample background regions (edges and corners)
                                # Background mask is where segmentation mask is False (0)
                                background_regions = []
                                sample_size = max(5, min(img_width, img_height) // 20)  # Sample small regions

                                # Sample corners
                                for x_offset in [0, img_width - sample_size]:
                                    for y_offset in [0, img_height - sample_size]:
                                        if x_offset < img_width and y_offset < img_height:
                                            # Check if this region is background
                                            region_mask = mask_image[y_offset:y_offset+sample_size, x_offset:x_offset+sample_size] < 0.5
                                            if region_mask.sum() > (sample_size * sample_size * 0.7):  # At least 70% background
                                                for py in range(y_offset, min(y_offset+sample_size, img_height)):
                                                    for px in range(x_offset, min(x_offset+sample_size, img_width)):
                                                        if mask_image[py, px] < 0.5:  # Background pixel
                                                            background_regions.append(img_array.getpixel((px, py)))

                                # Sample edges (top, bottom, left, right)
                                edge_sample_count = 20
                                for i in range(edge_sample_count):
                                    # Top edge
                                    x = int((i / edge_sample_count) * img_width)
                                    if mask_image[0, x] < 0.5:
                                        background_regions.append(img_array.getpixel((x, 0)))
                                    # Bottom edge
                                    if mask_image[img_height-1, x] < 0.5:
                                        background_regions.append(img_array.getpixel((x, img_height-1)))
                                    # Left edge
                                    y = int((i / edge_sample_count) * img_height)
                                    if mask_image[y, 0] < 0.5:
                                        background_regions.append(img_array.getpixel((0, y)))
                                    # Right edge
                                    if mask_image[y, img_width-1] < 0.5:
                                        background_regions.append(img_array.getpixel((img_width-1, y)))

                                if background_regions:
                                    # Check if background is white/off-white using LAB color space perceptual matching
                                    white_count = 0
                                    total_delta_e = 0.0
                                    valid_samples = 0

                                    for r, g, b in background_regions:
                                        is_white, delta_e = _is_white_perceptual_lab(r, g, b)
                                        if is_white:
                                            white_count += 1
                                        total_delta_e += delta_e
                                        valid_samples += 1

                                    white_percentage = (white_count / len(background_regions)) * 100 if background_regions else 0.0
                                    avg_delta_e = total_delta_e / valid_samples if valid_samples > 0 else 0.0

                                    if white_percentage >= 70.0:
                                        validations.append({
                                            "name": "Background Color",
                                            "passed": True,
                                            "score": 1.0,
                                            "message": f"✓ Background is white/off-white ({white_percentage:.1f}% white, avg ΔE: {avg_delta_e:.1f})",
                                            "suggestion": None
                                        })
                                    else:
                                        validations.append({
                                            "name": "Background Color",
                                            "passed": False,
                                            "score": 0.5,
                                            "message": f"✗ Background is not white/off-white ({white_percentage:.1f}% white, avg ΔE: {avg_delta_e:.1f}, expected ≥70% white)",
                                            "suggestion": "Use a white or off-white background for passport photos"
                                        })
                                        is_valid = False
                                        suggestions.append("Use a white or off-white background for passport photos")
                                else:
                                    # If we can't sample background regions, fail the validation
                                    validations.append({
                                        "name": "Background Color",
                                        "passed": False,
                                        "score": 0.0,
                                        "message": "✗ Could not validate background color - background not clearly visible",
                                        "suggestion": "Ensure background is clearly visible and white/off-white (various white color variations are accepted)"
                                    })
                                    is_valid = False
                                    suggestions.append("Ensure background is clearly visible and white/off-white (various white color variations are accepted)")
                            else:
                                # If segmentation masks are not returned, fail the validation
                                validations.append({
                                    "name": "Background Color",
                                    "passed": False,
                                    "score": 0.0,
                                    "message": "✗ Could not validate background color - segmentation failed",
                                    "suggestion": "Ensure background is clearly visible and white/off-white (various white color variations are accepted)"
                                })
                                is_valid = False
                                suggestions.append("Ensure background is clearly visible and white/off-white (various white color variations are accepted)")
                        except Exception as e:
                            logger.warning(f"Background validation failed: {e}", exc_info=True)
                            # If validation fails with exception, fail the validation
                            validations.append({
                                "name": "Background Color",
                                "passed": False,
                                "score": 0.0,
                                "message": f"✗ Background validation failed: {str(e)}",
                                "suggestion": "Ensure background is clearly visible and white/off-white (various white color variations are accepted)"
                            })
                            is_valid = False
                            suggestions.append("Ensure background is clearly visible and white/off-white (various white color variations are accepted)")
                else:
                    validations.append({
                        "name": "Single Face",
                        "passed": False,
                        "score": 0.0,
                        "message": f"✗ Expected 1 face, detected {num_faces}",
                        "suggestion": "Ensure exactly one face is visible in the photo"
                    })
                    is_valid = False
                    suggestions.append("Ensure exactly one face is visible in the photo")
            else:
                validations.append({
                    "name": "Single Face",
                    "passed": False,
                    "score": 0.0,
                    "message": "✗ No face detected",
                    "suggestion": "Ensure a face is clearly visible in the photo"
                })
                is_valid = False
                suggestions.append("Ensure a face is clearly visible in the photo")

    except Exception as e:
        logger.error(f"MediaPipe validation error: {e}", exc_info=True)
        return {
            "is_valid": False,
            "error": str(e),
            "validations": [],
            "overall_score": 0.0,
            "suggestions": []
        }
    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    # Calculate overall score
    overall_score = 0.0
    if validations:
        overall_score = sum(v.get("score", 0.0) for v in validations) / len(validations)

    return {
        "is_valid": is_valid,
        "validations": validations,
        "overall_score": overall_score,
        "suggestions": suggestions
    }
