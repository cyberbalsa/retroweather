# fido2_keysign.py Export Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `export-pubkey` (print EC public key PEM to stdout, no touch) and `export-pepk` (YubiKey touch → CKM_RSA_AES_KEY_WRAP → Google Play upload ZIP) commands to `fido2_keysign.py`.

**Architecture:** All changes are in a single file (`fido2_keysign.py`). Two new `cmd_*` functions follow the existing pattern. The PEPK encryption replicates the `--rsa-aes-encryption` path of Google's pepk-src.jar exactly: RSA-OAEP-SHA1 wraps an ephemeral AES-256 session key; RFC 5649 AES Key Wrap with Padding encrypts the PKCS8 DER of the signing key. The output ZIP contains `encryptedPrivateKey` and `certificate.pem` entries.

**Tech Stack:** Python 3, `cryptography` library (`hazmat.primitives.keywrap`, `asymmetric.padding`, `asymmetric.rsa`, `serialization`), `zipfile` (stdlib).

**Spec:** `docs/superpowers/specs/2026-03-18-fido2-export-commands-design.md`

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `fido2_keysign.py:26` | Add `zipfile` to import line |
| Modify | `fido2_keysign.py:1-24` | Add new commands to module docstring |
| Modify | `fido2_keysign.py` (top, after existing constants) | Add `GOOGLE_PUBKEY_FILE`, `UPLOAD_ZIP` constants |
| Modify | `fido2_keysign.py` (after `cmd_sign_both`) | Add `cmd_export_pubkey()` function |
| Modify | `fido2_keysign.py` (after `cmd_export_pubkey`) | Add `cmd_export_pepk()` function |
| Modify | `fido2_keysign.py:450-456` | Update `USAGE` string |
| Modify | `fido2_keysign.py:463-467` | Add two dispatch cases |
| Create | `tests/test_fido2_export.py` | Unit tests for pure crypto (no hardware needed) |

---

## Task 1: Add `zipfile` import and new constants

**Files:**
- Modify: `fido2_keysign.py:26` (import line)
- Modify: `fido2_keysign.py:31-34` (constants block)

- [ ] **Step 1: Add `zipfile` to the import line**

Change line 26 from:
```python
import sys, json, base64, hashlib, os, stat, subprocess, shutil, tempfile
```
To:
```python
import sys, json, base64, hashlib, os, stat, subprocess, shutil, tempfile, zipfile
```

- [ ] **Step 2: Add two new constants after `RP_ID`** (currently line 34)

After:
```python
RP_ID       = "weatherstarkiosk.signing"
```
Add:
```python
GOOGLE_PUBKEY_FILE = Path.home() / "google-pubkey.pem"
UPLOAD_ZIP         = Path.home() / "weatherstar-upload-key.zip"
```

- [ ] **Step 3: Verify Python parses cleanly**

```bash
python3 -c "import ast; ast.parse(open('fido2_keysign.py').read()); print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add fido2_keysign.py
git commit -m "chore: add zipfile import and PEPK path constants"
```

---

## Task 2: Create test file with crypto-layer tests (no YubiKey needed)

**Files:**
- Create: `tests/test_fido2_export.py`

The FIDO2 / YubiKey path cannot be unit-tested without hardware. The pure crypto operations (OAEP wrap, AES key wrap, binary layout) can be tested by exercising the PEPK encryption in isolation and verifying the output is structurally correct.

- [ ] **Step 1: Create `tests/conftest.py`** to ensure `fido2_keysign.py` is on the path regardless of how pytest is invoked

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
```

- [ ] **Step 2: Create `tests/test_fido2_export.py`**

```python
"""
Unit tests for the PEPK encryption logic in fido2_keysign.py.
Tests the pure-crypto layer only; no YubiKey hardware required.
"""
import os, sys, zipfile
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.keywrap import aes_key_unwrap_with_padding
from cryptography.hazmat.backends import default_backend

# ---------------------------------------------------------------------------
# Helper: generate a throwaway RSA key pair for encryption tests
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def rsa_keypair():
    priv = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    return priv, priv.public_key()


@pytest.fixture(scope="module")
def ec_signing_key():
    from cryptography.hazmat.primitives.asymmetric import ec
    return ec.generate_private_key(ec.SECP256R1(), default_backend())


# ---------------------------------------------------------------------------
# Import the function under test (without running __main__)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def pepk_encrypt(tmp_path_factory, rsa_keypair):
    """Returns a callable that encrypts a private key using the PEPK RSA-AES path."""
    _, rsa_pub = rsa_keypair
    pub_pem = rsa_pub.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    pub_path = tmp_path_factory.mktemp("keys") / "google-pubkey.pem"
    pub_path.write_bytes(pub_pem)

    def _encrypt(private_key):
        """Mirrors cmd_export_pepk's encryption logic exactly."""
        from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
        from cryptography.hazmat.primitives.keywrap import aes_key_wrap_with_padding
        from cryptography.hazmat.primitives.serialization import load_pem_public_key
        aes_key   = os.urandom(32)
        pkcs8_der = private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
        rsa_key   = load_pem_public_key(pub_path.read_bytes())
        enc_aes   = rsa_key.encrypt(
            aes_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA1()),
                algorithm=hashes.SHA1(),
                label=None,
            ),
        )
        wrapped   = aes_key_wrap_with_padding(aes_key, pkcs8_der, default_backend())
        return enc_aes + wrapped, aes_key, len(enc_aes)

    return _encrypt


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestPepkBinaryLayout:
    def test_encrypted_blob_starts_with_rsa_block(self, pepk_encrypt, ec_signing_key):
        blob, _, rsa_len = pepk_encrypt(ec_signing_key)
        # First rsa_len bytes are the RSA-OAEP encrypted AES key (= RSA key size in bytes)
        assert len(blob) > rsa_len, "blob must contain data beyond the RSA block"

    def test_rsa_block_length_equals_key_size(self, pepk_encrypt, ec_signing_key, rsa_keypair):
        priv, pub = rsa_keypair
        blob, _, rsa_len = pepk_encrypt(ec_signing_key)
        key_size_bytes = pub.key_size // 8  # 2048-bit → 256 bytes
        assert rsa_len == key_size_bytes

    def test_wrapped_portion_decrypts_to_original_der(self, pepk_encrypt, ec_signing_key, rsa_keypair):
        from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
        priv_rsa, _ = rsa_keypair
        blob, aes_key, rsa_len = pepk_encrypt(ec_signing_key)
        wrapped = blob[rsa_len:]
        recovered_der = aes_key_unwrap_with_padding(aes_key, wrapped, default_backend())
        expected_der  = ec_signing_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
        assert recovered_der == expected_der, "round-trip DER must match original"


class TestPepkRsaDecryptAesKey:
    def test_rsa_oaep_sha1_key_recovery(self, pepk_encrypt, ec_signing_key, rsa_keypair):
        priv_rsa, pub_rsa = rsa_keypair
        blob, original_aes_key, rsa_len = pepk_encrypt(ec_signing_key)
        enc_aes = blob[:rsa_len]
        recovered_aes = priv_rsa.decrypt(
            enc_aes,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA1()),
                algorithm=hashes.SHA1(),
                label=None,
            ),
        )
        assert recovered_aes == original_aes_key, "RSA-OAEP-SHA1 must recover the AES key"


class TestZipStructure:
    def test_zip_has_required_entries(self, tmp_path, ec_signing_key, rsa_keypair, pepk_encrypt):
        blob, _, _ = pepk_encrypt(ec_signing_key)
        # Generate a dummy cert PEM
        from fido2_keysign import _make_cert
        cert_pem = _make_cert(ec_signing_key).public_bytes(serialization.Encoding.PEM)
        zip_path = tmp_path / "out.zip"
        with zipfile.ZipFile(zip_path, 'w') as zf:
            zf.writestr("encryptedPrivateKey", blob)
            zf.writestr("certificate.pem", cert_pem)
        with zipfile.ZipFile(zip_path, 'r') as zf:
            names = zf.namelist()
        assert "encryptedPrivateKey" in names
        assert "certificate.pem" in names
        assert len(names) == 2, f"expected exactly 2 entries, got {names}"


class TestExportPubkeyFormat:
    def test_public_key_pem_is_valid(self, ec_signing_key):
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        pub_pem = ec_signing_key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
        assert pub_pem.startswith(b"-----BEGIN PUBLIC KEY-----")
        assert pub_pem.strip().endswith(b"-----END PUBLIC KEY-----")
```

- [ ] **Step 2: Run the tests to confirm they collect and most pass immediately**

`fido2_keysign.py` already has a `if __name__ == "__main__":` guard so it is importable now.
The pure-crypto tests (TestPepkBinaryLayout, TestPepkRsaDecryptAesKey, TestExportPubkeyFormat) exercise standalone primitives and should PASS immediately. TestZipStructure needs `_make_cert` which also already exists.

```bash
cd /home/cyberrange/weatherstartv && python3 -m pytest tests/test_fido2_export.py -v 2>&1 | head -40
```

Expected: most tests PASS. Any failures at this stage indicate a test file syntax error — fix before proceeding.

- [ ] **Step 3: Commit test file**

```bash
git add tests/test_fido2_export.py
git commit -m "test: add PEPK crypto and ZIP structure unit tests"
```

---

## Task 3: Verify importability and run initial tests

The file already has a `if __name__ == "__main__":` guard. This task confirms that, then runs the full suite before any `cmd_*` changes.

**Files:** None to modify.

- [ ] **Step 1: Confirm the guard and USAGE placement**

```bash
grep -n "__main__\|^USAGE" fido2_keysign.py
```

Expected: `USAGE` appears on a line number *before* the `if __name__ == "__main__":` line. No code modification needed.

- [ ] **Step 2: Run the full test suite**

```bash
python3 -m pytest tests/test_fido2_export.py -v
```

Expected: all tests PASS. The pure-crypto fixtures exercise standalone primitives that don't depend on any `cmd_*` function.

---

## Task 4: Implement `cmd_export_pubkey`

**Files:**
- Modify: `fido2_keysign.py` — add function after `cmd_sign_both`
- Modify: `fido2_keysign.py` — update module docstring and USAGE

- [ ] **Step 1: Add `cmd_export_pubkey()` after `cmd_sign_both` (around line 445)**

```python
def cmd_export_pubkey():
    """Print the signing public key (PEM) to stdout. No YubiKey touch required."""
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    cert = _load_cert()
    pub_pem = cert.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    sys.stdout.buffer.write(pub_pem)
```

- [ ] **Step 2: Update the module docstring** (lines 18–23, Commands section)

Add after `sign-both` line:
```
  export-pubkey              Print signing public key PEM to stdout (no touch needed)
  export-pepk                Touch YubiKey → write ~/weatherstar-upload-key.zip for Google Play
```

- [ ] **Step 3: Update the USAGE constant** (around line 450)

Add two lines to the USAGE string:
```
  export-pubkey                Print signing public key PEM (no touch needed)
  export-pepk                  Touch YubiKey → write ~/weatherstar-upload-key.zip
```

- [ ] **Step 4: Add dispatch case** (in the `if __name__` block)

Add after `sign-both` dispatch:
```python
    elif cmd == "export-pubkey" and len(args) == 1: cmd_export_pubkey()
```

- [ ] **Step 5: Parse check**

```bash
python3 -c "import ast; ast.parse(open('fido2_keysign.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Run pubkey format test**

```bash
python3 -m pytest tests/test_fido2_export.py::TestExportPubkeyFormat -v
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add fido2_keysign.py
git commit -m "feat: add export-pubkey command"
```

---

## Task 5: Implement `cmd_export_pepk`

**Files:**
- Modify: `fido2_keysign.py` — add function after `cmd_export_pubkey`
- Modify: `fido2_keysign.py` — add final dispatch case

- [ ] **Step 1: Add `cmd_export_pepk()` after `cmd_export_pubkey`**

```python
def cmd_export_pepk():
    """
    One YubiKey touch → derive signing key → CKM_RSA_AES_KEY_WRAP encrypt →
    write ~/weatherstar-upload-key.zip for Google Play App Signing upload.

    Binary layout of encryptedPrivateKey (matches pepk --rsa-aes-encryption):
      [RSA-OAEP-SHA1 encrypted AES-256 key][RFC-5649 AES-WrapPad encrypted PKCS8 DER]
    """
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PrivateFormat, NoEncryption, load_pem_public_key,
    )
    from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.keywrap import aes_key_wrap_with_padding
    from cryptography.hazmat.backends import default_backend

    # ── Preconditions (checked before touching YubiKey) ───────────────────
    if not GOOGLE_PUBKEY_FILE.exists():
        sys.exit(f"Google encryption public key not found: {GOOGLE_PUBKEY_FILE}\n"
                 f"Download it from Google Play Console → Setup → App signing.")
    if UPLOAD_ZIP.exists():
        sys.exit(f"Output file already exists: {UPLOAD_ZIP}\n"
                 f"Move or delete it before running export-pepk.")

    # ── Derive signing key (one touch) ────────────────────────────────────
    print("Touch your YubiKey to export the encrypted signing key...", file=sys.stderr)
    private_key = _derive_signing_key()

    # ── Serialize private key as PKCS8 DER ────────────────────────────────
    pkcs8_der = private_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())

    # ── Load Google RSA public key ────────────────────────────────────────
    rsa_pub = load_pem_public_key(GOOGLE_PUBKEY_FILE.read_bytes())

    # ── Generate ephemeral 256-bit AES session key ─────────────────────────
    aes_key = os.urandom(32)

    # ── RSA-OAEP-SHA1 wrap the AES key ────────────────────────────────────
    enc_aes = rsa_pub.encrypt(
        aes_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA1()),
            algorithm=hashes.SHA1(),
            label=None,
        ),
    )

    # ── RFC 5649 AES Key Wrap with Padding of PKCS8 DER ───────────────────
    wrapped = aes_key_wrap_with_padding(aes_key, pkcs8_der, default_backend())

    # ── Build encryptedPrivateKey blob ────────────────────────────────────
    encrypted_private_key = enc_aes + wrapped

    # ── Write ZIP ─────────────────────────────────────────────────────────
    cert_pem = CERT_FILE.read_bytes()
    with zipfile.ZipFile(UPLOAD_ZIP, 'w') as zf:
        zf.writestr("encryptedPrivateKey", encrypted_private_key)
        zf.writestr("certificate.pem", cert_pem)

    print(f"  ✓ Encrypted key written: {UPLOAD_ZIP}", file=sys.stderr)
    print(f"  Upload this ZIP to Google Play Console → Setup → App signing → Upload private key.",
          file=sys.stderr)
```

- [ ] **Step 2: Add dispatch case**

In the `if __name__` block, add after `export-pubkey`:
```python
    elif cmd == "export-pepk"   and len(args) == 1: cmd_export_pepk()
```

- [ ] **Step 3: Parse check**

```bash
python3 -c "import ast; ast.parse(open('fido2_keysign.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Run the full test suite**

```bash
python3 -m pytest tests/test_fido2_export.py -v
```

Expected: all tests PASS.

Output should look like:
```
tests/test_fido2_export.py::TestPepkBinaryLayout::test_encrypted_blob_starts_with_rsa_block PASSED
tests/test_fido2_export.py::TestPepkBinaryLayout::test_rsa_block_length_equals_key_size PASSED
tests/test_fido2_export.py::TestPepkBinaryLayout::test_wrapped_portion_decrypts_to_original_der PASSED
tests/test_fido2_export.py::TestPepkRsaDecryptAesKey::test_rsa_oaep_sha1_key_recovery PASSED
tests/test_fido2_export.py::TestZipStructure::test_zip_has_required_entries PASSED
tests/test_fido2_export.py::TestExportPubkeyFormat::test_public_key_pem_is_valid PASSED
```

- [ ] **Step 5: Commit**

```bash
git add fido2_keysign.py
git commit -m "feat: add export-pepk command (CKM_RSA_AES_KEY_WRAP)"
```

---

## Task 6: Final verification and push

- [ ] **Step 1: Run full test suite one more time**

```bash
python3 -m pytest tests/test_fido2_export.py -v
```

Expected: all PASS.

- [ ] **Step 2: Smoke-test CLI help output**

```bash
python3 fido2_keysign.py --help
```

Expected: USAGE string includes `export-pubkey` and `export-pepk` entries.

- [ ] **Step 3: Verify module still parses**

```bash
python3 -c "import ast; ast.parse(open('fido2_keysign.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Push to origin**

```bash
git push origin master
```
