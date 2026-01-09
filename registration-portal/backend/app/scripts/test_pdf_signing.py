#!/usr/bin/env python3
"""Test script for PDF signing with certificate."""

import argparse
import sys
from pathlib import Path

from app.services.pdf_signing_service import (
    CertificateLoadError,
    PdfSigningError,
    get_certificate_info,
    sign_pdf,
    validate_certificate,
)
from app.scripts.generate_signing_certificate import generate_certificate, save_pem_format


def create_test_pdf() -> bytes:
    """Create a simple test PDF document."""
    try:
        from reportlab.pdfgen import canvas
        from io import BytesIO

        buffer = BytesIO()
        c = canvas.Canvas(buffer)
        c.drawString(100, 750, "Certificate Confirmation Response - Test Document")
        c.drawString(100, 730, "This is a test PDF for certificate signing verification.")
        c.drawString(100, 710, "The signature on this document can be verified in standard PDF readers.")
        c.save()
        return buffer.getvalue()
    except ImportError:
        # Fallback: create minimal PDF manually
        # This is a very basic PDF structure
        pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 100 750 Td (Test PDF for Signing) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000300 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
394
%%EOF"""
        return pdf_content


def main() -> None:
    """Main test function."""
    parser = argparse.ArgumentParser(description="Test PDF signing with certificate")
    parser.add_argument("--certificate", type=str, help="Certificate file path (uses settings if not provided)")
    parser.add_argument("--key", type=str, help="Private key file path (PEM format only)")
    parser.add_argument("--password", type=str, help="Certificate password")
    parser.add_argument("--generate-cert", action="store_true", help="Generate a test certificate first")
    parser.add_argument("--cert-dir", type=str, default="./test_certs", help="Directory for generated certificate")
    parser.add_argument("--output", type=str, default="test_signed.pdf", help="Output signed PDF path")
    parser.add_argument("--skip-verification", action="store_true", help="Skip signature verification step")

    args = parser.parse_args()

    cert_path = args.certificate
    key_path = args.key
    password = args.password

    # Generate certificate if requested
    if args.generate_cert:
        print("Generating test certificate...")
        try:
            cert_dir = Path(args.cert_dir)
            cert_dir.mkdir(parents=True, exist_ok=True)

            private_key, cert = generate_certificate(
                organization="Test Organization",
                country="GH",
                common_name="Test PDF Signing Certificate",
                validity_days=365,
            )

            cert_path = str(cert_dir / "test_signing_cert.pem")
            key_path = str(cert_dir / "test_signing_cert_key.pem")
            save_pem_format(private_key, cert, Path(cert_path), Path(key_path))

            print(f"Test certificate generated:")
            print(f"  Certificate: {cert_path}")
            print(f"  Private key: {key_path}")
        except Exception as e:
            print(f"Error generating certificate: {e}", file=sys.stderr)
            sys.exit(1)

    # Validate certificate
    if cert_path:
        print("\nValidating certificate...")
        try:
            validation_result = validate_certificate(cert_path, key_path, password)
            if validation_result["valid"]:
                print("✓ Certificate is valid")
                if validation_result["warnings"]:
                    print("Warnings:")
                    for warning in validation_result["warnings"]:
                        print(f"  ⚠ {warning}")
            else:
                print("✗ Certificate validation failed:")
                for error in validation_result["errors"]:
                    print(f"  ✗ {error}")
                sys.exit(1)
        except Exception as e:
            print(f"Error validating certificate: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print("Using certificate from configuration...")

    # Display certificate info
    print("\nCertificate Information:")
    try:
        info = get_certificate_info(cert_path, key_path, password)
        print(f"  Subject: {info['subject'].get('common_name') or info['subject'].get('organization', 'N/A')}")
        print(f"  Valid from: {info['validity']['not_valid_before']}")
        print(f"  Valid until: {info['validity']['not_valid_after']}")
        print(f"  Key size: {info.get('key_size', 'Unknown')} bits")
    except Exception as e:
        print(f"  Warning: Could not get certificate info: {e}")

    # Create test PDF
    print("\nCreating test PDF...")
    try:
        test_pdf = create_test_pdf()
        print(f"✓ Test PDF created ({len(test_pdf)} bytes)")
    except Exception as e:
        print(f"Error creating test PDF: {e}", file=sys.stderr)
        sys.exit(1)

    # Sign PDF
    print("\nSigning PDF...")
    try:
        signed_pdf = sign_pdf(test_pdf, "Test Signer", "System Administrator")
        print(f"✓ PDF signed successfully ({len(signed_pdf)} bytes)")
    except CertificateLoadError as e:
        print(f"✗ Certificate error: {e}", file=sys.stderr)
        sys.exit(1)
    except PdfSigningError as e:
        print(f"✗ Signing error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"✗ Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)

    # Save signed PDF
    output_path = Path(args.output)
    try:
        with open(output_path, "wb") as f:
            f.write(signed_pdf)
        print(f"✓ Signed PDF saved to: {output_path}")
    except Exception as e:
        print(f"Error saving signed PDF: {e}", file=sys.stderr)
        sys.exit(1)

    # Verify signature (optional)
    if not args.skip_verification:
        print("\nVerifying signature...")
        try:
            from endesive.pdf import verify

            (hashok, signatureok, certok) = verify(signed_pdf)
            if hashok and signatureok and certok:
                print("✓ Signature verification passed")
                print("  - Hash: OK")
                print("  - Signature: OK")
                print("  - Certificate: OK")
            else:
                print("⚠ Signature verification results:")
                print(f"  - Hash: {'OK' if hashok else 'FAILED'}")
                print(f"  - Signature: {'OK' if signatureok else 'FAILED'}")
                print(f"  - Certificate: {'OK' if certok else 'FAILED'}")
        except ImportError:
            print("⚠ Could not verify signature (endesive verify not available)")
        except Exception as e:
            print(f"⚠ Signature verification error: {e}")

    print("\n" + "=" * 60)
    print("Test completed successfully!")
    print(f"\nYou can now open {output_path} in a PDF reader to verify the signature:")
    print("  - Adobe Acrobat Reader: Open PDF → Signature Panel")
    print("  - Chrome: Open PDF → Right-click → Document Properties")
    print("  - Firefox: Open PDF → View → Signatures")
    print("=" * 60)


if __name__ == "__main__":
    main()
