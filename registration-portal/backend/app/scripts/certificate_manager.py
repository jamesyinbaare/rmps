#!/usr/bin/env python3
"""Unified CLI tool for certificate management operations."""

import argparse
import json
import sys
from pathlib import Path

from app.scripts.generate_signing_certificate import generate_certificate, save_p12_format, save_pem_format
from app.services.pdf_signing_service import (
    CertificateLoadError,
    get_certificate_info,
    validate_certificate,
)


def cmd_generate(args: argparse.Namespace) -> None:
    """Generate a new certificate."""
    try:
        print("Generating certificate...")
        private_key, cert = generate_certificate(
            organization=args.organization,
            country=args.country,
            state=args.state,
            locality=args.locality,
            common_name=args.common_name,
            validity_days=args.validity_days,
            key_size=args.key_size,
        )

        if args.format == "pem":
            # Determine output paths
            if args.output_dir:
                output_dir = Path(args.output_dir)
                output_dir.mkdir(parents=True, exist_ok=True)
                cert_path = output_dir / f"{args.cert_name}.pem"
                key_path = output_dir / f"{args.cert_name}_key.pem"
            elif args.cert_output or args.key_output:
                cert_path = Path(args.cert_output or f"{args.cert_name}.pem")
                key_path = Path(args.key_output or f"{args.cert_name}_key.pem")
            else:
                # Default to current directory
                cert_path = Path(f"{args.cert_name}.pem")
                key_path = Path(f"{args.cert_name}_key.pem")

            save_pem_format(private_key, cert, cert_path, key_path)
        else:  # p12
            if not args.password:
                print("Error: --password is required for P12 format", file=sys.stderr)
                sys.exit(1)

            if args.output_dir:
                output_dir = Path(args.output_dir)
                output_dir.mkdir(parents=True, exist_ok=True)
                p12_path = output_dir / f"{args.cert_name}.p12"
            else:
                p12_path = Path(args.output or f"{args.cert_name}.p12")

            save_p12_format(private_key, cert, p12_path, args.password)

        print("\nCertificate generated successfully!")

    except Exception as e:
        print(f"Error generating certificate: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_validate(args: argparse.Namespace) -> None:
    """Validate a certificate."""
    try:
        result = validate_certificate(
            cert_path=args.certificate,
            key_path=args.key,
            password=args.password,
        )

        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print("Certificate Validation Results")
            print("=" * 50)
            if result["valid"]:
                print("Status: ✓ VALID")
            else:
                print("Status: ✗ INVALID")

            if result["errors"]:
                print("\nErrors:")
                for error in result["errors"]:
                    print(f"  ✗ {error}")

            if result["warnings"]:
                print("\nWarnings:")
                for warning in result["warnings"]:
                    print(f"  ⚠ {warning}")

            if result["info"]:
                print("\nCertificate Information:")
                for key, value in result["info"].items():
                    print(f"  {key}: {value}")

        sys.exit(0 if result["valid"] else 1)

    except Exception as e:
        print(f"Error validating certificate: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_info(args: argparse.Namespace) -> None:
    """Display certificate information."""
    try:
        info = get_certificate_info(
            cert_path=args.certificate,
            key_path=args.key,
            password=args.password,
        )

        if args.json:
            print(json.dumps(info, indent=2, default=str))
        else:
            print("Certificate Information")
            print("=" * 50)
            print(f"\nSubject:")
            for key, value in info["subject"].items():
                if value:
                    print(f"  {key}: {value}")

            print(f"\nIssuer:")
            for key, value in info["issuer"].items():
                if value:
                    print(f"  {key}: {value}")

            print(f"\nValidity:")
            print(f"  Not valid before: {info['validity']['not_valid_before']}")
            print(f"  Not valid after: {info['validity']['not_valid_after']}")
            print(f"  Currently valid: {'Yes' if info['validity']['is_valid'] else 'No'}")

            print(f"\nTechnical Details:")
            print(f"  Serial number: {info['serial_number']}")
            print(f"  Version: {info['version']}")
            print(f"  Key type: {info.get('key_type', 'Unknown')}")
            if "key_size" in info:
                print(f"  Key size: {info['key_size']} bits")

            if info.get("extensions"):
                print(f"\nExtensions:")
                if "key_usage" in info["extensions"]:
                    ku = info["extensions"]["key_usage"]
                    print(f"  Key Usage:")
                    print(f"    Digital Signature: {ku.get('digital_signature', False)}")
                    print(f"    Content Commitment: {ku.get('content_commitment', False)}")

    except CertificateLoadError as e:
        print(f"Error loading certificate: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error getting certificate info: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_convert(args: argparse.Namespace) -> None:
    """Convert certificate between formats."""
    try:
        from cryptography.hazmat.primitives.serialization import pkcs12, serialization

        from app.services.pdf_signing_service import _load_certificate_p12, _load_certificate_pem

        # Load source certificate
        if args.input.lower().endswith((".p12", ".pfx")):
            if not args.input_password:
                print("Error: --input-password is required for P12/PFX input", file=sys.stderr)
                sys.exit(1)
            cert, private_key = _load_certificate_p12(args.input, args.input_password)
        else:
            cert, private_key = _load_certificate_pem(args.input, args.key, args.input_password)

        # Save in target format
        if args.output.lower().endswith((".p12", ".pfx")):
            if not args.output_password:
                print("Error: --output-password is required for P12/PFX output", file=sys.stderr)
                sys.exit(1)

            p12_data = pkcs12.serialize_key_and_certificates(
                name=b"PDF Signing Certificate",
                key=private_key,
                cert=cert,
                cas=None,
                encryption_algorithm=serialization.BestAvailableEncryption(args.output_password.encode()),
            )
            with open(args.output, "wb") as f:
                f.write(p12_data)
            print(f"Certificate converted to P12 format: {args.output}")
        else:
            save_pem_format(private_key, cert, Path(args.output), Path(args.output.replace(".pem", "_key.pem")))
            print(f"Certificate converted to PEM format: {args.output}")

    except Exception as e:
        print(f"Error converting certificate: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_test_sign(args: argparse.Namespace) -> None:
    """Test signing a sample PDF."""
    try:
        from io import BytesIO

        from reportlab.pdfgen import canvas

        from app.services.pdf_signing_service import sign_pdf

        buffer = BytesIO()
        c = canvas.Canvas(buffer)
        c.drawString(100, 750, "Test PDF for Certificate Signing")
        c.drawString(100, 730, f"Generated at: {args.timestamp or 'now'}")
        c.save()
        test_pdf_bytes = buffer.getvalue()

        # Sign the PDF
        print("Signing test PDF...")
        signed_pdf = sign_pdf(test_pdf_bytes, "Test Signer", "System Administrator")

        # Save signed PDF
        output_path = Path(args.output or "test_signed.pdf")
        with open(output_path, "wb") as f:
            f.write(signed_pdf)

        print(f"Test PDF signed successfully: {output_path}")
        print("You can now verify the signature in a PDF reader (Adobe Reader, Chrome, etc.)")

    except Exception as e:
        print(f"Error testing signature: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(description="Certificate management tool for PDF signing")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Generate command
    gen_parser = subparsers.add_parser("generate", help="Generate a new certificate")
    gen_parser.add_argument("--format", choices=["pem", "p12"], default="pem", help="Certificate format")
    gen_parser.add_argument("--output-dir", type=str, help="Output directory for certificate files")
    gen_parser.add_argument("--output", type=str, help="Output file path (for P12, overrides --output-dir)")
    gen_parser.add_argument("--cert-output", type=str, help="Certificate output path (PEM, overrides --output-dir)")
    gen_parser.add_argument("--key-output", type=str, help="Key output path (PEM, overrides --output-dir)")
    gen_parser.add_argument("--cert-name", type=str, default="signing_cert", help="Base name for certificate files")
    gen_parser.add_argument("--organization", type=str, default="PDF Signing Organization", help="Organization name")
    gen_parser.add_argument("--country", type=str, default="GH", help="Country code")
    gen_parser.add_argument("--state", type=str, help="State or province")
    gen_parser.add_argument("--locality", type=str, help="Locality/city")
    gen_parser.add_argument("--common-name", type=str, default="PDF Signing Certificate", help="Common name")
    gen_parser.add_argument("--validity-days", type=int, default=365, help="Validity in days")
    gen_parser.add_argument("--key-size", type=int, choices=[2048, 4096], default=2048, help="Key size")
    gen_parser.add_argument("--password", type=str, help="Password for P12 format")
    gen_parser.set_defaults(func=cmd_generate)

    # Validate command
    val_parser = subparsers.add_parser("validate", help="Validate a certificate")
    val_parser.add_argument("--certificate", type=str, help="Certificate file path (uses settings if not provided)")
    val_parser.add_argument("--key", type=str, help="Private key file path (PEM format only)")
    val_parser.add_argument("--password", type=str, help="Certificate password")
    val_parser.add_argument("--json", action="store_true", help="Output as JSON")
    val_parser.set_defaults(func=cmd_validate)

    # Info command
    info_parser = subparsers.add_parser("info", help="Display certificate information")
    info_parser.add_argument("--certificate", type=str, help="Certificate file path (uses settings if not provided)")
    info_parser.add_argument("--key", type=str, help="Private key file path (PEM format only)")
    info_parser.add_argument("--password", type=str, help="Certificate password")
    info_parser.add_argument("--json", action="store_true", help="Output as JSON")
    info_parser.set_defaults(func=cmd_info)

    # Convert command
    conv_parser = subparsers.add_parser("convert", help="Convert certificate between formats")
    conv_parser.add_argument("--input", type=str, required=True, help="Input certificate file")
    conv_parser.add_argument("--key", type=str, help="Private key file (for PEM input)")
    conv_parser.add_argument("--input-password", type=str, help="Input file password")
    conv_parser.add_argument("--output", type=str, required=True, help="Output certificate file")
    conv_parser.add_argument("--output-password", type=str, help="Output file password (for P12)")
    conv_parser.set_defaults(func=cmd_convert)

    # Test sign command
    test_parser = subparsers.add_parser("test-sign", help="Test signing a sample PDF")
    test_parser.add_argument("--output", type=str, help="Output PDF file path")
    test_parser.add_argument("--timestamp", type=str, help="Timestamp for test PDF")
    test_parser.set_defaults(func=cmd_test_sign)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
