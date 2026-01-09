"""Service for digitally signing PDF documents."""

import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from endesive.pdf import cms
from pypdf import PdfReader

from app.config import settings

logger = logging.getLogger(__name__)


class PdfSigningError(Exception):
    """Raised when PDF signing fails."""

    pass


class CertificateLoadError(Exception):
    """Raised when certificate/key loading fails."""

    pass


def _load_certificate_pem(cert_path: str, key_path: str | None = None, password: str | None = None) -> tuple[Any, Any]:
    """
    Load certificate and private key from PEM files.

    Args:
        cert_path: Path to certificate file (.pem, .crt)
        key_path: Path to private key file (.key, .pem). If None, assumes cert_path contains both.
        password: Password for encrypted private key (if applicable)

    Returns:
        Tuple of (certificate, private_key)
    """
    cert_file = Path(cert_path)
    if not cert_file.exists():
        raise CertificateLoadError(f"Certificate file not found: {cert_path}")

    try:
        # Load certificate
        with open(cert_file, "rb") as f:
            cert_data = f.read()

        cert = x509.load_pem_x509_certificate(cert_data)

        # Load private key
        if key_path:
            key_file = Path(key_path)
            if not key_file.exists():
                raise CertificateLoadError(f"Private key file not found: {key_path}")
            with open(key_file, "rb") as f:
                key_data = f.read()
        else:
            # Try to load key from same file
            key_data = cert_data

        # Try to load as unencrypted first
        try:
            private_key = serialization.load_pem_private_key(key_data, password=None)
        except ValueError:
            # If that fails, try with password
            if password:
                private_key = serialization.load_pem_private_key(
                    key_data, password=password.encode() if isinstance(password, str) else password
                )
            else:
                raise CertificateLoadError("Private key is encrypted but no password provided")

        return cert, private_key
    except Exception as e:
        raise CertificateLoadError(f"Failed to load PEM certificate/key: {e}") from e


def _load_certificate_p12(p12_path: str, password: str | None = None) -> tuple[Any, Any]:
    """
    Load certificate and private key from P12/PFX file.

    Args:
        p12_path: Path to P12/PFX file
        password: Password for P12/PFX file

    Returns:
        Tuple of (certificate, private_key)
    """
    p12_file = Path(p12_path)
    if not p12_file.exists():
        raise CertificateLoadError(f"P12/PFX file not found: {p12_path}")

    try:
        with open(p12_file, "rb") as f:
            p12_data = f.read()

        p12_password = password.encode() if password and isinstance(password, str) else password

        try:
            private_key, certificate, additional_certificates = pkcs12.load_key_and_certificates(p12_data, p12_password)
        except ValueError as e:
            if "incorrect password" in str(e).lower() or "bad decrypt" in str(e).lower():
                raise CertificateLoadError("Incorrect password for P12/PFX file") from e
            raise CertificateLoadError(f"Failed to load P12/PFX file: {e}") from e

        if not certificate:
            raise CertificateLoadError("No certificate found in P12/PFX file")
        if not private_key:
            raise CertificateLoadError("No private key found in P12/PFX file")

        return certificate, private_key
    except CertificateLoadError:
        raise
    except Exception as e:
        raise CertificateLoadError(f"Failed to load P12/PFX certificate: {e}") from e


def _load_certificate_chain(chain_path: str | None) -> list[Any] | None:
    """
    Load certificate chain from file.

    Args:
        chain_path: Path to certificate chain file (PEM format)

    Returns:
        List of certificates in chain, or None if not provided
    """
    if not chain_path:
        return None

    chain_file = Path(chain_path)
    if not chain_file.exists():
        logger.warning(f"Certificate chain file not found: {chain_path}. Continuing without chain.")
        return None

    try:
        with open(chain_file, "rb") as f:
            chain_data = f.read()

        # Load all certificates from the chain file
        certificates = []
        for cert_pem in chain_data.split(b"-----BEGIN CERTIFICATE-----"):
            if cert_pem.strip():
                cert_pem = b"-----BEGIN CERTIFICATE-----" + cert_pem
                try:
                    cert = x509.load_pem_x509_certificate(cert_pem)
                    certificates.append(cert)
                except Exception:
                    continue

        if not certificates:
            logger.warning(f"No certificates found in chain file: {chain_path}")
            return None

        logger.info(f"Loaded {len(certificates)} certificates from chain file")
        return certificates
    except Exception as e:
        logger.warning(f"Failed to load certificate chain: {e}. Continuing without chain.")
        return None


def sign_pdf(pdf_bytes: bytes, signer_name: str, signer_title: str | None = None) -> bytes:
    """
    Sign a PDF document with a digital signature.

    Args:
        pdf_bytes: Unsigned PDF file as bytes
        signer_name: Name of the signer
        signer_title: Optional title/position of the signer

    Returns:
        Signed PDF file as bytes

    Raises:
        PdfSigningError: If signing fails
        CertificateLoadError: If certificate/key cannot be loaded
    """
    if not settings.pdf_signing_enabled:
        raise PdfSigningError("PDF signing is not enabled. Set PDF_SIGNING_ENABLED=true to enable.")

    if not settings.pdf_signing_certificate_path:
        raise CertificateLoadError("PDF signing certificate path is not configured")

    # Validate certificate before signing
    validation_result = validate_certificate()
    if not validation_result["valid"]:
        error_msg = "Certificate validation failed: " + "; ".join(validation_result["errors"])
        raise CertificateLoadError(error_msg)
    if validation_result["warnings"]:
        for warning in validation_result["warnings"]:
            logger.warning(f"Certificate warning: {warning}")

    try:
        # Load certificate and private key
        cert_path = settings.pdf_signing_certificate_path
        cert_path_lower = cert_path.lower()

        if cert_path_lower.endswith((".p12", ".pfx")):
            # P12/PFX format
            cert, private_key = _load_certificate_p12(cert_path, settings.pdf_signing_certificate_password)
        else:
            # PEM format
            cert, private_key = _load_certificate_pem(
                cert_path, settings.pdf_signing_key_path, settings.pdf_signing_certificate_password
            )

        # Load certificate chain if available
        cert_chain = _load_certificate_chain(settings.pdf_signing_certificate_chain_path)

        # Prepare signature metadata
        signer_info = signer_name
        if signer_title:
            signer_info = f"{signer_name}, {signer_title}"

        # Build certificate chain for endesive
        # endesive expects:
        #   cert: the signing certificate (single certificate)
        #   othercerts: list of additional certificates in the chain (intermediate and root CAs)
        othercerts = cert_chain if cert_chain else []

        # Verify PDF is readable before signing
        pdf_reader = None
        try:
            pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
            num_pages = len(pdf_reader.pages)
            if num_pages == 0:
                raise PdfSigningError("PDF has no pages and cannot be signed")
            logger.debug(f"PDF verified: {num_pages} pages, {len(pdf_bytes)} bytes")
        except Exception as e:
            raise PdfSigningError(f"PDF cannot be read and may be corrupted: {e}") from e

        # Prepare signing parameters
        # Use simple datetime format - endesive will format it correctly for PDF
        # Format: YYYYMMDDHHmmSS (endesive handles the D: prefix and timezone internally)
        signing_date = datetime.utcnow().strftime("%Y%m%d%H%M%S")

        dct = {
            # Signature flags: 1 = signatures exist, 2 = append only
            # Set to 3 only if document already has signatures - for new signatures, omit or set to 1
            "sigflags": 1,  # 1 = signatures exist (we're adding one)
            "contact": settings.pdf_signing_contact_info or "",
            "location": settings.pdf_signing_location or "Ghana",
            "reason": settings.pdf_signing_reason or "Certificate Confirmation Response",
            "signingdate": signing_date,
            "signer": signer_info,
        }

        # Add organization if configured
        if settings.pdf_signing_organization:
            dct["organization"] = settings.pdf_signing_organization

        # Sign the PDF using endesive
        # endesive.cms.sign expects: datau (unsigned data), udct (signature dictionary), key, cert, othercerts, algomd
        # algomd is the hash/digest algorithm (e.g., "sha256", "sha384", "sha512"), not the signing algorithm
        try:
            # Log the input PDF size for debugging
            logger.debug(f"Signing PDF: {len(pdf_bytes)} bytes, {len(pdf_reader.pages)} pages")

            # Call endesive cms.sign with proper error handling
            # cms.sign should return the full signed PDF (or signature data to append)
            try:
                signature_data = cms.sign(
                    datau=pdf_bytes,  # Use original PDF bytes - endesive needs the original structure
                    udct=dct,  # Signature dictionary (use udct for cms.sign)
                    key=private_key,
                    cert=cert,  # Signing certificate (single certificate, not a list)
                    othercerts=othercerts,  # Certificate chain (list of intermediate and root CAs)
                    algomd="sha256",  # Hash/digest algorithm (sha256, sha384, or sha512)
                )

                # Check if we got a full PDF or just signature data
                # If it starts with %PDF, it's the full signed PDF
                # Otherwise, it might be signature data that needs to be appended
                if signature_data.startswith(b"%PDF"):
                    # Full signed PDF
                    signed_pdf_bytes = signature_data
                elif len(signature_data) > len(pdf_bytes) * 0.9:
                    # Large data, likely full PDF even without header
                    signed_pdf_bytes = signature_data
                else:
                    # Small data, likely just signature - append to original PDF
                    # This is the incremental update approach
                    signed_pdf_bytes = pdf_bytes + signature_data
                    logger.info("Appended signature data to original PDF (incremental update)")

            except Exception as sign_error:
                # Log the full error for debugging
                logger.error(f"Endesive cms.sign raised exception: {sign_error}", exc_info=True)
                raise PdfSigningError(f"Endesive signing failed: {sign_error}") from sign_error
            except Exception as sign_error:
                # Log the full error for debugging
                logger.error(f"Endesive pdf.cms.sign raised exception: {sign_error}", exc_info=True)
                raise PdfSigningError(f"Endesive signing failed: {sign_error}") from sign_error

            # Log what we got back
            logger.debug(f"Endesive returned: {len(signed_pdf_bytes)} bytes, starts with: {signed_pdf_bytes[:50]}")

            # Basic validation: check that we got bytes back
            if not signed_pdf_bytes:
                raise PdfSigningError("Endesive returned empty bytes - signing failed")

            # Check if PDF header exists (might have leading whitespace)
            pdf_header_pos = signed_pdf_bytes.find(b"%PDF")
            if pdf_header_pos == -1:
                # No PDF header found - this is definitely wrong
                raise PdfSigningError(
                    f"Endesive returned {len(signed_pdf_bytes)} bytes with no %PDF header. "
                    f"Got: {signed_pdf_bytes[:200]}"
                )

            # If PDF header is not at the start, strip leading bytes
            if pdf_header_pos > 0:
                logger.warning(f"PDF header found at position {pdf_header_pos}, stripping leading {pdf_header_pos} bytes")
                signed_pdf_bytes = signed_pdf_bytes[pdf_header_pos:]

            # Check if we got a full PDF or just signature data
            # If it's too small, it might be just the signature - this shouldn't happen with cms.sign
            if len(signed_pdf_bytes) < len(pdf_bytes) * 0.1:
                raise PdfSigningError(
                    f"Signed PDF size ({len(signed_pdf_bytes)}) is too small compared to original ({len(pdf_bytes)}). "
                    f"This suggests the PDF may be corrupted or endesive returned unexpected data."
                )

            # Verify PDF structure by checking if it now starts with %PDF
            if not signed_pdf_bytes.startswith(b"%PDF"):
                raise PdfSigningError(f"Signed PDF does not start with %PDF header after processing. Got: {signed_pdf_bytes[:100]}")

            logger.info(f"PDF signed successfully: {len(signed_pdf_bytes)} bytes (original: {len(pdf_bytes)} bytes)")

        except Exception as e:
            raise PdfSigningError(f"Failed to sign PDF: {e}") from e

        logger.info(f"PDF signed successfully by {signer_info}")
        return signed_pdf_bytes

    except CertificateLoadError:
        raise
    except PdfSigningError:
        raise
    except Exception as e:
        raise PdfSigningError(f"Unexpected error during PDF signing: {e}") from e


def validate_certificate(
    cert_path: str | None = None,
    key_path: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    """
    Validate a certificate for PDF signing.

    Args:
        cert_path: Path to certificate file (uses settings if None)
        key_path: Path to private key file (uses settings if None, PEM format only)
        password: Password for certificate (uses settings if None)

    Returns:
        Dictionary with validation results:
        {
            "valid": bool,
            "errors": list[str],
            "warnings": list[str],
            "info": dict[str, Any]
        }
    """
    errors: list[str] = []
    warnings: list[str] = []
    info: dict[str, Any] = {}

    # Use settings if paths not provided
    if cert_path is None:
        cert_path = settings.pdf_signing_certificate_path
    if key_path is None:
        key_path = settings.pdf_signing_key_path
    if password is None:
        password = settings.pdf_signing_certificate_password

    if not cert_path:
        return {
            "valid": False,
            "errors": ["Certificate path not configured"],
            "warnings": [],
            "info": {},
        }

    try:
        # Load certificate and key
        cert_path_lower = cert_path.lower()
        if cert_path_lower.endswith((".p12", ".pfx")):
            cert, private_key = _load_certificate_p12(cert_path, password)
        else:
            cert, private_key = _load_certificate_pem(cert_path, key_path, password)

        # Extract certificate information
        info["subject"] = str(cert.subject)
        info["issuer"] = str(cert.issuer)
        info["serial_number"] = str(cert.serial_number)
        # Use UTC-aware datetime methods if available (newer cryptography), fallback to naive for compatibility
        if hasattr(cert, "not_valid_before_utc"):
            not_valid_before = cert.not_valid_before_utc
            not_valid_after = cert.not_valid_after_utc
            # Use timezone-aware datetime for comparison
            now = datetime.now(timezone.utc)
        else:
            # Fallback for older cryptography versions (deprecated but still works)
            not_valid_before = cert.not_valid_before
            not_valid_after = cert.not_valid_after
            # Use naive datetime for comparison
            now = datetime.utcnow()

        info["not_valid_before"] = not_valid_before.isoformat()
        info["not_valid_after"] = not_valid_after.isoformat()

        # Check validity dates
        if not_valid_after < now:
            errors.append(f"Certificate expired on {not_valid_after.isoformat()}")
        elif not_valid_before > now:
            errors.append(f"Certificate not yet valid (valid from {not_valid_before.isoformat()})")
        else:
            days_until_expiry = (not_valid_after - now).days
            info["days_until_expiry"] = days_until_expiry
            if days_until_expiry < 30:
                warnings.append(f"Certificate expires in {days_until_expiry} days")

        # Check key usage
        try:
            key_usage = cert.extensions.get_extension_for_oid(x509.oid.ExtensionOID.KEY_USAGE).value
            if not key_usage.digital_signature:
                errors.append("Certificate does not have Digital Signature key usage")
            if not key_usage.content_commitment:
                warnings.append("Certificate does not have Non-Repudiation (Content Commitment) key usage")
        except x509.ExtensionNotFound:
            warnings.append("Certificate does not have Key Usage extension")

        # Check key size
        if hasattr(private_key, "key_size"):
            key_size = private_key.key_size
            info["key_size"] = key_size
            if key_size < 2048:
                errors.append(f"Key size ({key_size} bits) is less than recommended minimum (2048 bits)")
            elif key_size == 2048:
                warnings.append("Consider using 4096-bit key for production")
        else:
            warnings.append("Could not determine key size")

        # Verify key matches certificate
        try:
            # Try to verify the certificate's public key matches the private key
            public_key = cert.public_key()
            # This is a basic check - in practice, we'd do a cryptographic verification
            if hasattr(public_key, "key_size") and hasattr(private_key, "key_size"):
                if public_key.key_size != private_key.key_size:
                    errors.append("Public key and private key sizes do not match")
        except Exception:
            warnings.append("Could not verify key-certificate match")

        # Check certificate chain if configured
        if settings.pdf_signing_certificate_chain_path:
            chain = _load_certificate_chain(settings.pdf_signing_certificate_chain_path)
            if chain:
                info["chain_certificates"] = len(chain)
            else:
                warnings.append("Certificate chain file specified but could not be loaded")

    except CertificateLoadError as e:
        errors.append(f"Failed to load certificate: {str(e)}")
    except Exception as e:
        errors.append(f"Unexpected error during validation: {str(e)}")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "info": info,
    }


def get_certificate_info(cert_path: str | None = None, key_path: str | None = None, password: str | None = None) -> dict[str, Any]:
    """
    Get detailed information about a certificate.

    Args:
        cert_path: Path to certificate file (uses settings if None)
        key_path: Path to private key file (uses settings if None, PEM format only)
        password: Password for certificate (uses settings if None)

    Returns:
        Dictionary with certificate information
    """
    # Use settings if paths not provided
    if cert_path is None:
        cert_path = settings.pdf_signing_certificate_path
    if key_path is None:
        key_path = settings.pdf_signing_key_path
    if password is None:
        password = settings.pdf_signing_certificate_password

    if not cert_path:
        raise CertificateLoadError("Certificate path not configured")

    # Load certificate
    cert_path_lower = cert_path.lower()
    if cert_path_lower.endswith((".p12", ".pfx")):
        cert, private_key = _load_certificate_p12(cert_path, password)
    else:
        cert, private_key = _load_certificate_pem(cert_path, key_path, password)

    # Use UTC-aware datetime if available
    if hasattr(cert, "not_valid_before_utc"):
        not_valid_before_info = cert.not_valid_before_utc
        not_valid_after_info = cert.not_valid_after_utc
        # Use timezone-aware datetime for comparison
        now = datetime.now(timezone.utc)
    else:
        not_valid_before_info = cert.not_valid_before
        not_valid_after_info = cert.not_valid_after
        # Use naive datetime for comparison
        now = datetime.utcnow()

    info: dict[str, Any] = {
        "subject": {
            "common_name": None,
            "organization": None,
            "country": None,
            "state": None,
            "locality": None,
        },
        "issuer": {
            "common_name": None,
            "organization": None,
            "country": None,
        },
        "validity": {
            "not_valid_before": not_valid_before_info.isoformat(),
            "not_valid_after": not_valid_after_info.isoformat(),
            "is_valid": not_valid_before_info <= now <= not_valid_after_info,
        },
        "serial_number": str(cert.serial_number),
        "version": cert.version.name,
    }

    # Extract subject attributes
    for attr in cert.subject:
        if attr.oid == x509.oid.NameOID.COMMON_NAME:
            info["subject"]["common_name"] = attr.value
        elif attr.oid == x509.oid.NameOID.ORGANIZATION_NAME:
            info["subject"]["organization"] = attr.value
        elif attr.oid == x509.oid.NameOID.COUNTRY_NAME:
            info["subject"]["country"] = attr.value
        elif attr.oid == x509.oid.NameOID.STATE_OR_PROVINCE_NAME:
            info["subject"]["state"] = attr.value
        elif attr.oid == x509.oid.NameOID.LOCALITY_NAME:
            info["subject"]["locality"] = attr.value

    # Extract issuer attributes
    for attr in cert.issuer:
        if attr.oid == x509.oid.NameOID.COMMON_NAME:
            info["issuer"]["common_name"] = attr.value
        elif attr.oid == x509.oid.NameOID.ORGANIZATION_NAME:
            info["issuer"]["organization"] = attr.value
        elif attr.oid == x509.oid.NameOID.COUNTRY_NAME:
            info["issuer"]["country"] = attr.value

    # Key information
    if hasattr(private_key, "key_size"):
        info["key_size"] = private_key.key_size
        info["key_type"] = "RSA"
    else:
        info["key_type"] = "Unknown"

    # Extensions
    info["extensions"] = {}
    try:
        key_usage = cert.extensions.get_extension_for_oid(x509.oid.ExtensionOID.KEY_USAGE).value
        info["extensions"]["key_usage"] = {
            "digital_signature": key_usage.digital_signature,
            "content_commitment": key_usage.content_commitment,
            "key_encipherment": key_usage.key_encipherment,
        }
    except x509.ExtensionNotFound:
        pass

    try:
        ext_key_usage = cert.extensions.get_extension_for_oid(x509.oid.ExtensionOID.EXTENDED_KEY_USAGE).value
        info["extensions"]["extended_key_usage"] = [str(oid) for oid in ext_key_usage]
    except x509.ExtensionNotFound:
        pass

    return info
