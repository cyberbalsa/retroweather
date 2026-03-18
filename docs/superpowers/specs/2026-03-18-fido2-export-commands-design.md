# Design: fido2_keysign.py export commands

**Date:** 2026-03-18
**Source authority:** `/tmp/pepk-src.jar` → `ExportEncryptedPrivateKeyTool.java` (method `encryptPrivateKeyWithCkmRsaAesKeyWrapEncryption`)

## Overview

Add two new commands to the existing single-file YubiKey-backed Android signing tool:

- `export-pubkey` — print the signing public key (PEM) to stdout; no YubiKey touch required
- `export-pepk` — derive signing key (one touch), encrypt with CKM_RSA_AES_KEY_WRAP, write Google Play upload ZIP

## New Constants

```python
GOOGLE_PUBKEY_FILE = Path.home() / "google-pubkey.pem"
UPLOAD_ZIP         = Path.home() / "weatherstar-upload-key.zip"
```

## `export-pubkey` Command

**No YubiKey touch required.**

1. Call existing `_load_cert()` to load `CERT_FILE` → `x509.Certificate` object
2. Call `.public_key()` on the cert object
3. Serialize to PEM with `public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)`
4. Print to stdout

The public key is already persisted in the signing certificate — no YubiKey contact needed.

## `export-pepk` Command

**One YubiKey touch required.** Implements the `--rsa-aes-encryption` mode of the PEPK tool exactly.

### Clarification: "signing key" = the key being exported

There is one key in this tool: the EC P-256 key derived from the YubiKey HMAC-secret. It serves as both the APK signing key and the key being exported to Google Play. These are the same object.

### Inputs

- Signing private key: derived via `_derive_signing_key()` — EC P-256, in memory only
- Google RSA encryption public key: `~/google-pubkey.pem` — RSA-3072, PEM format (confirmed from file)

### Output

- `~/weatherstar-upload-key.zip` — ZIP compatible with Google Play App Signing upload

### Encryption algorithm: CKM_RSA_AES_KEY_WRAP (verbatim from PEPK source)

```
Step 1. Generate random 256-bit AES session key:  os.urandom(32)
Step 2. Serialize private key as PKCS8 DER:        private_key.private_bytes(DER, PKCS8, NoEncryption())
Step 3. RSA-OAEP encrypt the AES session key:
          algorithm  = OAEP(mgf=MGF1(algorithm=hashes.SHA1()),
                            algorithm=hashes.SHA1(), label=None)
          enc_aes    = rsa_pub.encrypt(aes_key, algorithm)
          # NOTE: hashes.SHA1() must be instantiated — the class itself raises TypeError
Step 4. AES Key Wrap with Padding (RFC 5649) of PKCS8 DER:
          wrapped    = aes_key_wrap_with_padding(aes_key, pkcs8_der, default_backend())
Step 5. Concatenate:
          encryptedPrivateKey = enc_aes + wrapped
```

### Binary layout of `encryptedPrivateKey`

```
[RSA-OAEP-SHA1 encrypted AES-256 key — 384 bytes (RSA-3072 / 8)]
[RFC 5649 AES-Key-Wrap-Pad encrypted PKCS8 DER — variable length]
```

No length prefix. No nonce. No GCM tag. This is AES Key Wrap (not AES-GCM).

### ZIP structure (identical to PEPK)

| ZIP entry | Content |
|---|---|
| `encryptedPrivateKey` | Binary blob above |
| `certificate.pem` | `CERT_FILE.read_bytes()` — raw bytes from disk, no re-serialization |

Note: there is no signature entry (no `--signing-keystore` used).

### ZIP write details

Open with `zipfile.ZipFile(UPLOAD_ZIP, 'w')`. Mode `'w'` creates a new file; the pre-check above ensures it does not already exist.

### Python imports required (all stdlib or already-imported)

- `zipfile` — stdlib, not yet imported; append to the existing single-line `import sys, json, ...` statement
- `cryptography.hazmat.primitives.keywrap.aes_key_wrap_with_padding` — in `cryptography`, already a dependency
- `cryptography.hazmat.primitives.asymmetric.padding` (OAEP, MGF1)
- `cryptography.hazmat.primitives.hashes.SHA1`
- `cryptography.hazmat.primitives.serialization` (load_pem_public_key, Encoding.DER, PrivateFormat.PKCS8, NoEncryption)
- `cryptography.hazmat.backends.default_backend`

All from `cryptography`, which is already required by the existing code.

### Random byte source

Use `os.urandom(32)` — consistent with the rest of the file (see `_TempKeystore.__init__`).

## Error handling

- `export-pubkey`: exits with message if `CERT_FILE` missing (delegates to existing `_load_cert()`)
- `export-pepk` — preconditions checked IN THIS ORDER before any YubiKey touch:
  1. exits if `GOOGLE_PUBKEY_FILE` does not exist
  2. exits if `UPLOAD_ZIP` already exists (prevent silent overwrite)
  3. YubiKey errors from `_find_device()` / `_derive_signing_key()`

## Implementation approach

Single-file, inline — two new `cmd_*` functions added after existing commands, following the exact same style. Two new constants added near the top alongside `CRED_FILE`, `CERT_FILE`. The only change to the import line is adding `zipfile`.

## Updated module docstring and USAGE string

Both the module-level docstring (lines 2–24) and the `USAGE` constant must be updated.

```
export-pubkey                Print signing public key PEM to stdout (no touch needed)
export-pepk                  Touch YubiKey → write ~/weatherstar-upload-key.zip for Google Play
```

## Dispatch additions

```python
elif cmd == "export-pubkey" and len(args) == 1: cmd_export_pubkey()
elif cmd == "export-pepk"   and len(args) == 1: cmd_export_pepk()
```
