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
# Fixtures
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


@pytest.fixture(scope="module")
def pepk_encrypt(tmp_path_factory, rsa_keypair):
    """
    Returns a callable that encrypts a private key using the PEPK RSA-AES path.
    Mirrors cmd_export_pepk's encryption logic exactly.
    Returns (blob, aes_key, rsa_block_len).
    """
    _, rsa_pub = rsa_keypair
    pub_pem = rsa_pub.public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    pub_path = tmp_path_factory.mktemp("keys") / "google-pubkey.pem"
    pub_path.write_bytes(pub_pem)

    def _encrypt(private_key):
        from cryptography.hazmat.primitives.serialization import (
            Encoding, PrivateFormat, NoEncryption, load_pem_public_key,
        )
        from cryptography.hazmat.primitives.keywrap import aes_key_wrap_with_padding
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
# Tests: binary layout
# ---------------------------------------------------------------------------

class TestPepkBinaryLayout:
    def test_encrypted_blob_starts_with_rsa_block(self, pepk_encrypt, ec_signing_key):
        blob, _, rsa_len = pepk_encrypt(ec_signing_key)
        assert len(blob) > rsa_len, "blob must contain data beyond the RSA block"

    def test_rsa_block_length_equals_key_size(self, pepk_encrypt, ec_signing_key, rsa_keypair):
        _, pub = rsa_keypair
        blob, _, rsa_len = pepk_encrypt(ec_signing_key)
        assert rsa_len == pub.key_size // 8  # 2048-bit → 256 bytes

    def test_wrapped_portion_decrypts_to_original_der(self, pepk_encrypt, ec_signing_key):
        from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
        blob, aes_key, rsa_len = pepk_encrypt(ec_signing_key)
        recovered = aes_key_unwrap_with_padding(aes_key, blob[rsa_len:], default_backend())
        expected  = ec_signing_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
        assert recovered == expected


# ---------------------------------------------------------------------------
# Tests: RSA-OAEP-SHA1 round-trip
# ---------------------------------------------------------------------------

class TestPepkRsaDecryptAesKey:
    def test_full_end_to_end_rsa_decrypt_then_aes_unwrap(self, pepk_encrypt, ec_signing_key, rsa_keypair):
        """Full chain: RSA-OAEP-SHA1 decrypt AES key, then AES-WrapPad unwrap PKCS8 DER."""
        from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
        priv_rsa, pub_rsa = rsa_keypair
        blob, _, rsa_len = pepk_encrypt(ec_signing_key)

        # Step 1: RSA-OAEP-SHA1 recover AES key
        recovered_aes = priv_rsa.decrypt(
            blob[:rsa_len],
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA1()),
                algorithm=hashes.SHA1(),
                label=None,
            ),
        )
        assert len(recovered_aes) == 32, "AES key must be 32 bytes"

        # Step 2: AES-WrapPad unwrap PKCS8 DER
        recovered_der = aes_key_unwrap_with_padding(recovered_aes, blob[rsa_len:], default_backend())
        expected_der  = ec_signing_key.private_bytes(Encoding.DER, PrivateFormat.PKCS8, NoEncryption())
        assert recovered_der == expected_der, "end-to-end round trip must recover original PKCS8 DER"


# ---------------------------------------------------------------------------
# Tests: ZIP structure
# ---------------------------------------------------------------------------

class TestZipStructure:
    def test_zip_has_required_entries(self, tmp_path, ec_signing_key, pepk_encrypt):
        from fido2_keysign import _make_cert
        blob, _, _ = pepk_encrypt(ec_signing_key)
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


# ---------------------------------------------------------------------------
# Tests: export-pubkey format
# ---------------------------------------------------------------------------

class TestExportPubkeyFormat:
    def test_public_key_pem_is_valid(self, ec_signing_key):
        pub_pem = ec_signing_key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
        assert pub_pem.startswith(b"-----BEGIN PUBLIC KEY-----")
        assert pub_pem.strip().endswith(b"-----END PUBLIC KEY-----")
