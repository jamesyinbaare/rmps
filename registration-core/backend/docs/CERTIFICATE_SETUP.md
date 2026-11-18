# Certificate Setup Guide for PDF Signing

This guide explains how to set up digital certificates for PDF signing in the certificate confirmation response system.

## Table of Contents

1. [Overview](#overview)
2. [Certificate Types](#certificate-types)
3. [Certificate Generation](#certificate-generation)
4. [Configuration](#configuration)
5. [Certificate Formats](#certificate-formats)
6. [Production Recommendations](#production-recommendations)
7. [Troubleshooting](#troubleshooting)
8. [Certificate Renewal](#certificate-renewal)

## Overview

The PDF signing system uses digital certificates to cryptographically sign PDF documents. When a certificate confirmation response is signed, the PDF is embedded with a digital signature that can be verified by recipients using standard PDF readers.

### Key Concepts

- **Digital Signature**: A cryptographic signature that proves the document's authenticity and integrity
- **Certificate**: Contains the public key and identity information
- **Private Key**: Used to create the signature (must be kept secret)
- **Certificate Chain**: Intermediate and root certificates for CA-signed certificates

## Certificate Types

### Self-Signed Certificates

**Use Case**: Development, testing, internal use

**Pros**:
- Free to generate
- Quick to set up
- No external dependencies

**Cons**:
- Recipients see "Unknown Trust" warning
- Requires manual trust by recipients
- Not suitable for official/official documents

### CA-Signed Certificates

**Use Case**: Production, official documents

**Pros**:
- Automatically trusted by PDF readers
- Better user experience
- Professional appearance

**Cons**:
- May require purchasing from a Certificate Authority
- Additional setup and cost
- Certificate expiration management

## Certificate Generation

### Using the Generation Script

The easiest way to generate a certificate is using the provided script:

```bash
# Generate PEM format (separate certificate and key files)
python app/scripts/generate_signing_certificate.py \
  --format pem \
  --output-dir ./certs \
  --organization "Your Organization Name" \
  --country GH \
  --state "Greater Accra" \
  --locality "Accra" \
  --common-name "PDF Signing Certificate" \
  --validity-days 365 \
  --key-size 2048

# Generate P12 format (single password-protected file)
python app/scripts/generate_signing_certificate.py \
  --format p12 \
  --output ./certs/signing.p12 \
  --password "your_secure_password" \
  --organization "Your Organization Name" \
  --country GH \
  --validity-days 365
```

### Using the Certificate Manager

The unified certificate manager provides multiple operations:

```bash
# Generate certificate
python app/scripts/certificate_manager.py generate \
  --format pem \
  --organization "Your Organization" \
  --country GH \
  --validity-days 365

# Validate certificate
python app/scripts/certificate_manager.py validate \
  --certificate ./certs/signing_cert.pem \
  --key ./certs/signing_cert_key.pem

# Display certificate information
python app/scripts/certificate_manager.py info \
  --certificate ./certs/signing_cert.pem \
  --key ./certs/signing_cert_key.pem

# Convert between formats
python app/scripts/certificate_manager.py convert \
  --input ./certs/signing_cert.pem \
  --key ./certs/signing_cert_key.pem \
  --output ./certs/signing.p12 \
  --output-password "password"
```

### Using OpenSSL (Alternative)

If you prefer using OpenSSL directly:

```bash
# Generate self-signed certificate (PEM format)
openssl req -x509 -newkey rsa:2048 \
  -keyout signing_key.pem \
  -out signing_cert.pem \
  -days 365 \
  -nodes \
  -subj "/C=GH/ST=Greater Accra/L=Accra/O=Your Organization/CN=PDF Signing Certificate"

# Convert to P12 format
openssl pkcs12 -export \
  -out signing.p12 \
  -inkey signing_key.pem \
  -in signing_cert.pem \
  -name "PDF Signing Certificate" \
  -passout pass:your_password
```

## Configuration

### Environment Variables

Configure the certificate in your `.env` file or environment:

```bash
# Enable PDF signing
PDF_SIGNING_ENABLED=true

# Certificate configuration (PEM format)
PDF_SIGNING_CERTIFICATE_PATH=./certs/signing_cert.pem
PDF_SIGNING_KEY_PATH=./certs/signing_cert_key.pem
PDF_SIGNING_CERTIFICATE_PASSWORD=

# OR Certificate configuration (P12 format)
PDF_SIGNING_CERTIFICATE_PATH=./certs/signing.p12
PDF_SIGNING_CERTIFICATE_PASSWORD=your_password

# Optional: Certificate chain (for CA-signed certificates)
PDF_SIGNING_CERTIFICATE_CHAIN_PATH=./certs/chain.pem

# Signature metadata
PDF_SIGNING_REASON=Certificate Confirmation Response
PDF_SIGNING_LOCATION=Ghana
PDF_SIGNING_CONTACT_INFO=contact@example.com
PDF_SIGNING_ORGANIZATION=Your Organization Name
```

### Configuration in config.py

The settings are defined in `app/config.py` and can be overridden via environment variables (using pydantic-settings).

## Certificate Formats

### PEM Format

**Structure**: Two separate files
- Certificate file: `.pem`, `.crt`
- Private key file: `.pem`, `.key`

**Configuration**:
```bash
PDF_SIGNING_CERTIFICATE_PATH=./certs/signing_cert.pem
PDF_SIGNING_KEY_PATH=./certs/signing_cert_key.pem
```

**Pros**:
- Easy to inspect (text format)
- Can encrypt key separately
- Standard format

**Cons**:
- Two files to manage
- Key must be kept secure

### P12/PFX Format

**Structure**: Single password-protected file containing both certificate and key

**Configuration**:
```bash
PDF_SIGNING_CERTIFICATE_PATH=./certs/signing.p12
PDF_SIGNING_CERTIFICATE_PASSWORD=your_password
```

**Pros**:
- Single file
- Password-protected
- Common in enterprise environments

**Cons**:
- Binary format (harder to inspect)
- Password required

## Production Recommendations

### Certificate Requirements

1. **Key Size**: Use 4096-bit RSA keys for production (2048-bit minimum)
2. **Validity Period**: Set appropriate validity (1-3 years typical)
3. **CA-Signed**: Use certificates from a trusted Certificate Authority
4. **Certificate Chain**: Include intermediate and root certificates

### Security Best Practices

1. **Storage**:
   - Store certificates in secure location (not in repository)
   - Use environment variables or secrets management
   - Restrict file permissions (chmod 600 for keys)

2. **Access Control**:
   - Limit access to certificate files
   - Use password-protected P12 files
   - Rotate certificates before expiration

3. **Monitoring**:
   - Monitor certificate expiration dates
   - Set up alerts for upcoming expirations
   - Test certificate renewal process

### Example Production Setup

```bash
# Generate production certificate (4096-bit, 3 years)
python app/scripts/generate_signing_certificate.py \
  --format p12 \
  --output /secure/certs/production_signing.p12 \
  --password "$(openssl rand -base64 32)" \
  --organization "Your Organization" \
  --country GH \
  --validity-days 1095 \
  --key-size 4096
```

## Troubleshooting

### Common Issues

#### Certificate Not Found

**Error**: `Certificate file not found`

**Solution**:
- Verify the path in `PDF_SIGNING_CERTIFICATE_PATH`
- Check file permissions
- Ensure path is absolute or relative to application directory

#### Invalid Password

**Error**: `Incorrect password for P12/PFX file`

**Solution**:
- Verify `PDF_SIGNING_CERTIFICATE_PASSWORD` is correct
- Check for extra spaces or special characters
- Try loading certificate manually to verify password

#### Certificate Expired

**Error**: `Certificate expired`

**Solution**:
- Generate a new certificate
- Update configuration with new certificate path
- Consider setting up automatic renewal alerts

#### Key Usage Invalid

**Error**: `Certificate does not have Digital Signature key usage`

**Solution**:
- Regenerate certificate with proper key usage
- Use the provided generation script (automatically sets correct usage)

#### Signature Verification Fails

**Issue**: Recipients cannot verify signature

**Solutions**:
- For self-signed: Recipients need to manually trust the certificate
- For CA-signed: Ensure certificate chain is included
- Provide certificate file for recipients to import

### Testing Certificate

Use the test script to verify your certificate setup:

```bash
python app/scripts/test_pdf_signing.py \
  --certificate ./certs/signing_cert.pem \
  --key ./certs/signing_cert_key.pem \
  --output test_signed.pdf
```

This will:
1. Validate the certificate
2. Create a test PDF
3. Sign the PDF
4. Verify the signature
5. Save the signed PDF for manual verification

## Certificate Renewal

### Before Expiration

1. **Monitor Expiration**: Check certificate validity regularly
   ```bash
   python app/scripts/certificate_manager.py validate
   ```

2. **Generate New Certificate**: Create replacement certificate
   ```bash
   python app/scripts/generate_signing_certificate.py \
     --format p12 \
     --output ./certs/signing_new.p12 \
     --password "new_password" \
     --validity-days 365
   ```

3. **Test New Certificate**: Verify it works
   ```bash
   python app/scripts/test_pdf_signing.py \
     --certificate ./certs/signing_new.p12 \
     --password "new_password"
   ```

4. **Update Configuration**: Update environment variables
   ```bash
   PDF_SIGNING_CERTIFICATE_PATH=./certs/signing_new.p12
   PDF_SIGNING_CERTIFICATE_PASSWORD=new_password
   ```

5. **Restart Application**: Reload configuration

### After Expiration

If certificate has already expired:

1. Generate new certificate immediately
2. Update configuration
3. Re-sign any critical documents if needed
4. Set up monitoring to prevent future expiration

## Additional Resources

- [Cryptography Library Documentation](https://cryptography.io/)
- [OpenSSL Documentation](https://www.openssl.org/docs/)
- [PDF Digital Signatures (Adobe)](https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSig/overview.html)

## Support

For issues or questions:
1. Check certificate validation: `python app/scripts/certificate_manager.py validate`
2. Review application logs for detailed error messages
3. Test with the test script: `python app/scripts/test_pdf_signing.py`
