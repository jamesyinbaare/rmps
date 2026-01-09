#!/usr/bin/env python3
"""Script to generate self-signed certificates for PDF signing."""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def generate_certificate(
    organization: str = "PDF Signing Organization",
    country: str = "GH",
    state: str | None = None,
    locality: str | None = None,
    common_name: str = "PDF Signing Certificate",
    validity_days: int = 365,
    key_size: int = 2048,
) -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    """
    Generate a self-signed certificate for PDF signing.

    Args:
        organization: Organization name
        country: Country code (2 letters)
        state: State or province name
        locality: Locality/city name
        common_name: Common name for the certificate
        validity_days: Certificate validity period in days
        key_size: RSA key size (2048 or 4096)

    Returns:
        Tuple of (private_key, certificate)
    """
    # Generate private key
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=key_size)

    # Build certificate subject and issuer (self-signed)
    name_attributes = [
        x509.NameAttribute(NameOID.COUNTRY_NAME, country),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ]

    if state:
        name_attributes.append(x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, state))
    if locality:
        name_attributes.append(x509.NameAttribute(NameOID.LOCALITY_NAME, locality))

    subject = issuer = x509.Name(name_attributes)

    # Create certificate
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.utcnow())
        .not_valid_after(datetime.utcnow() + timedelta(days=validity_days))
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,  # Non-repudiation
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]),  # Common for document signing
            critical=False,
        )
        .sign(private_key, hashes.SHA256())
    )

    return private_key, cert


def save_pem_format(private_key: rsa.RSAPrivateKey, cert: x509.Certificate, cert_path: Path, key_path: Path) -> None:
    """Save certificate and key in PEM format."""
    # Save certificate
    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    # Save private key (unencrypted)
    with open(key_path, "wb") as f:
        f.write(
            private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )

    print(f"Certificate saved to: {cert_path}")
    print(f"Private key saved to: {key_path}")


def save_p12_format(
    private_key: rsa.RSAPrivateKey, cert: x509.Certificate, p12_path: Path, password: str
) -> None:
    """Save certificate and key in P12/PFX format."""
    from cryptography.hazmat.primitives.serialization import pkcs12

    p12_data = pkcs12.serialize_key_and_certificates(
        name=b"PDF Signing Certificate",
        key=private_key,
        cert=cert,
        cas=None,  # No CA certificates for self-signed
        encryption_algorithm=serialization.BestAvailableEncryption(password.encode()),
    )

    with open(p12_path, "wb") as f:
        f.write(p12_data)

    print(f"P12 certificate saved to: {p12_path}")
    print(f"Password: {password}")


def main() -> None:
    """Main function to generate certificate."""
    parser = argparse.ArgumentParser(description="Generate self-signed certificate for PDF signing")
    parser.add_argument(
        "--format",
        choices=["pem", "p12"],
        default="pem",
        help="Certificate format (default: pem)",
    )
    parser.add_argument("--output-dir", type=str, help="Output directory for PEM format files")
    parser.add_argument("--output", type=str, help="Output file path (for P12 format or custom PEM paths)")
    parser.add_argument("--organization", type=str, default="PDF Signing Organization", help="Organization name")
    parser.add_argument("--country", type=str, default="GH", help="Country code (2 letters)")
    parser.add_argument("--state", type=str, help="State or province name")
    parser.add_argument("--locality", type=str, help="Locality/city name")
    parser.add_argument("--common-name", type=str, default="PDF Signing Certificate", help="Common name (CN)")
    parser.add_argument("--validity-days", type=int, default=365, help="Certificate validity in days (default: 365)")
    parser.add_argument("--key-size", type=int, choices=[2048, 4096], default=2048, help="RSA key size (default: 2048)")
    parser.add_argument("--password", type=str, help="Password for P12 format (required for P12)")
    parser.add_argument(
        "--cert-name",
        type=str,
        default="signing_cert",
        help="Base name for certificate files (PEM format only, default: signing_cert)",
    )

    args = parser.parse_args()

    # Validate P12 password requirement
    if args.format == "p12" and not args.password:
        print("Error: --password is required for P12 format", file=sys.stderr)
        sys.exit(1)

    try:
        # Generate certificate
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

        # Determine output paths
        if args.format == "pem":
            if args.output_dir:
                output_dir = Path(args.output_dir)
                output_dir.mkdir(parents=True, exist_ok=True)
                cert_path = output_dir / f"{args.cert_name}.pem"
                key_path = output_dir / f"{args.cert_name}_key.pem"
            elif args.output:
                # If output is specified, use it as cert path and derive key path
                output_path = Path(args.output)
                cert_path = output_path
                key_path = output_path.parent / f"{output_path.stem}_key{output_path.suffix}"
            else:
                # Default to current directory
                cert_path = Path(f"{args.cert_name}.pem")
                key_path = Path(f"{args.cert_name}_key.pem")

            save_pem_format(private_key, cert, cert_path, key_path)
            print(f"\nCertificate Information:")
            print(f"  Subject: {cert.subject}")
            print(f"  Valid from: {cert.not_valid_before}")
            print(f"  Valid until: {cert.not_valid_after}")
            print(f"  Key size: {args.key_size} bits")

        else:  # p12 format
            if args.output:
                p12_path = Path(args.output)
            else:
                p12_path = Path("signing_cert.p12")

            p12_path.parent.mkdir(parents=True, exist_ok=True)
            save_p12_format(private_key, cert, p12_path, args.password)
            print(f"\nCertificate Information:")
            print(f"  Subject: {cert.subject}")
            print(f"  Valid from: {cert.not_valid_before}")
            print(f"  Valid until: {cert.not_valid_after}")
            print(f"  Key size: {args.key_size} bits")

        print("\nCertificate generated successfully!")

    except Exception as e:
        print(f"Error generating certificate: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
