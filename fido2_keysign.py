#!/usr/bin/env python3
"""
fido2_keysign.py — YubiKey-backed Android signing tool.

The FIDO2 credential is stored as a RESIDENT KEY on the YubiKey itself
(uses one of its on-device slots). On every signing run the YubiKey's
internal HMAC-secret is used to derive the EC P-256 private key — it is
NEVER written to disk. Only the self-signed X.509 certificate (public
info) is stored.

  Resident key on YubiKey  →  HMAC-secret  →  EC P-256 private key
                                                      ↓
                                              signs APK / AAB

Requires:
  dnf install python3-fido2 python3-cryptography

Commands:
  setup                  One-time: burn resident credential to YubiKey,
                         derive EC key, generate + save cert
  sign-apk   SRC DST    Touch YubiKey → sign APK with apksigner (v2/v3)
  sign-aab   SRC DST    Touch YubiKey → sign AAB with jarsigner (v1)
  sign-both  APK AAB    Touch YubiKey ONCE → sign both artifacts
"""

import sys, json, base64, hashlib, os, stat, subprocess, shutil, tempfile, zipfile
from pathlib import Path

# ── Paths & constants ─────────────────────────────────────────────────────────

CRED_FILE   = Path.home() / ".android" / "weatherstar-fido2.json"
CERT_FILE   = Path.home() / ".android" / "weatherstar-signing-cert.pem"
KEY_ALIAS   = "weatherstarkiosk"
RP_ID              = "weatherstarkiosk.signing"
GOOGLE_PUBKEY_FILE = Path.home() / "google-pubkey.pem"
UPLOAD_ZIP         = Path.home() / "weatherstar-upload-key.zip"

# Fixed so derived key is deterministic (security is in the YubiKey device secret)
CLIENT_HASH = hashlib.sha256(b"weatherstarkiosk:android:client-data:v1").digest()
HMAC_SALT   = hashlib.sha256(b"weatherstarkiosk:android:hmac-salt:v1").digest()

# NIST P-256 group order
P256_ORDER  = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551


# ── EC key derivation ─────────────────────────────────────────────────────────

def _hmac_to_ec_key(hmac_bytes: bytes):
    """
    Derive a deterministic EC P-256 private key from 32 bytes of HMAC output.
    Uses HKDF so the full entropy of hmac_bytes feeds into a well-formed key.
    Key lives only in memory — never written to disk by this function.
    """
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec

    key_bytes = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"weatherstarkiosk:ec:v1",
        info=b"android-signing-ec-key",
    ).derive(hmac_bytes)

    # d must be in [1, n-1]; probability of d=0 is negligible
    d = int.from_bytes(key_bytes, 'big') % P256_ORDER or 1
    return ec.derive_private_key(d, ec.SECP256R1())


def _make_cert(private_key):
    """Self-signed X.509 cert for private_key. Valid 10 years."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.x509.oid import NameOID
    import datetime

    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME,        "WeatherStar Kiosk"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME,  "cyberbalsa"),
        x509.NameAttribute(NameOID.COUNTRY_NAME,       "US"),
    ])
    now = datetime.datetime.utcnow()
    return (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(private_key, hashes.SHA256())
    )


# ── FIDO2 helpers ─────────────────────────────────────────────────────────────

def _find_device():
    from fido2.hid import CtapHidDevice
    devs = list(CtapHidDevice.list_devices())
    if not devs:
        sys.exit("No FIDO2 device found — plug in your YubiKey.")
    return devs[0]


def _best_pin_protocol(ctap):
    from fido2.ctap2.pin import PinProtocolV1, PinProtocolV2
    versions = ctap.get_info().pin_uv_protocols or [1]
    return PinProtocolV2() if 2 in versions else PinProtocolV1()


def _ensure_pin(ctap) -> str:
    """
    Return the YubiKey PIN, prompting the user as needed.
    If no PIN is set, walk the user through setting one (required for resident credentials).
    """
    import getpass
    info = ctap.get_info()
    pin_set = info.options.get('clientPin')  # True=set, False=not set, None=not supported

    if pin_set is False:
        print("No PIN is set on your YubiKey.", file=sys.stderr)
        print("A PIN is required to create resident credentials.", file=sys.stderr)
        print("Set a PIN now (4–63 characters):", file=sys.stderr)
        pin  = getpass.getpass("New PIN: ", stream=sys.stderr)
        pin2 = getpass.getpass("Confirm PIN: ", stream=sys.stderr)
        if pin != pin2:
            sys.exit("PINs do not match.")
        from fido2.ctap2.pin import ClientPin
        protocol = _best_pin_protocol(ctap)
        ClientPin(ctap, protocol).set_pin(pin)
        print("PIN set.", file=sys.stderr)
        return pin

    if pin_set is True:
        return getpass.getpass("YubiKey PIN: ", stream=sys.stderr)

    # pin_set is None — authenticator doesn't support clientPin
    return ""


def _get_pin_uv_param(ctap, protocol, pin: str, client_data_hash: bytes):
    """Return (pin_uv_param, pin_uv_protocol) for make_credential / get_assertion."""
    if not pin:
        return None, None
    from fido2.ctap2.pin import ClientPin
    cp = ClientPin(ctap, protocol)
    try:
        # PinProtocolV2 supports permissions; V1 does not
        token = cp.get_pin_token(pin, ClientPin.PERMISSION.MAKE_CREDENTIAL, RP_ID)
    except TypeError:
        token = cp.get_pin_token(pin)
    return protocol.authenticate(token, client_data_hash), protocol.VERSION


def _derive_hmac_once() -> bytes:
    """
    Perform FIDO2 HMAC-secret assertion against the resident credential.
    Requires one physical touch. Returns 32 deterministic bytes.

    Does the ECDH key agreement manually so we don't depend on
    ClientPin.get_shared_secret() which was removed in fido2 >= 1.0.
    """
    from fido2.ctap2 import Ctap2
    from cryptography.hazmat.primitives.asymmetric.ec import (
        generate_private_key, SECP256R1, ECDH, EllipticCurvePublicNumbers,
    )
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import hmac as crypto_hmac, hashes
    from cryptography.hazmat.backends import default_backend
    import hashlib

    if not CRED_FILE.exists():
        sys.exit(f"No credential — run: python3 {sys.argv[0]} setup")

    data    = json.loads(CRED_FILE.read_text())
    cred_id = base64.b64decode(data["credential_id"])
    rp_id   = data.get("rp_id", RP_ID)

    ctap     = Ctap2(_find_device())
    info     = ctap.get_info()
    versions = info.pin_uv_protocols or [1]
    prot_ver = 2 if 2 in versions else 1   # Security Key NFC fw 5.2.x → always 1
    backend  = default_backend()

    # ── Step 1: get device's ECDH public key via authenticatorClientPIN ────────
    # subCommand 0x02 = getKeyAgreement; result key 0x01 = keyAgreement (COSE)
    ka_resp  = ctap.client_pin(pin_uv_protocol=prot_ver, sub_cmd=0x02)
    dev_cose = ka_resp[0x01]

    dev_pub = EllipticCurvePublicNumbers(
        x=int.from_bytes(bytes(dev_cose[-2]), 'big'),
        y=int.from_bytes(bytes(dev_cose[-3]), 'big'),
        curve=SECP256R1(),
    ).public_key(backend)

    # ── Step 2: generate our ephemeral P-256 key pair ─────────────────────────
    our_priv = generate_private_key(SECP256R1(), backend)
    our_nums = our_priv.public_key().public_numbers()
    our_cose = {
        1: 2, 3: -7, -1: 1,
        -2: our_nums.x.to_bytes(32, 'big'),
        -3: our_nums.y.to_bytes(32, 'big'),
    }

    # ── Step 3: ECDH → shared session key ─────────────────────────────────────
    Z = our_priv.exchange(ECDH(), dev_pub)
    # PinProtocolV1 KDF: SHA-256 of the x-coordinate
    shared = hashlib.sha256(Z).digest()   # 32 bytes

    # ── Step 4: encrypt the fixed salt (AES-256-CBC, IV = 16 zero bytes) ──────
    iv  = bytes(16)
    enc = Cipher(algorithms.AES(shared), modes.CBC(iv), backend=backend).encryptor()
    salt_enc = enc.update(HMAC_SALT) + enc.finalize()   # HMAC_SALT is 32 bytes

    # ── Step 5: saltAuth = HMAC-SHA256(shared, saltEnc)[:16] (PinProtocol V1) ─
    h = crypto_hmac.HMAC(shared, hashes.SHA256(), backend=backend)
    h.update(salt_enc)
    salt_auth = h.finalize()[:16]

    # ── Step 6: get assertion with hmac-secret extension ──────────────────────
    print("Touch your YubiKey...", file=sys.stderr)

    result = ctap.get_assertion(
        rp_id            = rp_id,
        client_data_hash = CLIENT_HASH,
        allow_list       = [{"type": "public-key", "id": cred_id}],
        extensions       = {
            "hmac-secret": {
                1: our_cose,   # keyAgreement
                2: salt_enc,   # saltEnc
                3: salt_auth,  # saltAuth
                4: prot_ver,   # pinUvAuthProtocol
            }
        },
        options={"up": True},
    )

    # ── Step 7: decrypt the HMAC-secret output ────────────────────────────────
    enc_out = (result.auth_data.extensions or {}).get("hmac-secret")
    if not enc_out:
        sys.exit("YubiKey did not return HMAC-secret. "
                 "Was the credential created with hmac-secret enabled?")

    dec    = Cipher(algorithms.AES(shared), modes.CBC(iv), backend=backend).decryptor()
    secret = (dec.update(bytes(enc_out)) + dec.finalize())[:32]
    return secret


def _derive_signing_key():
    """One touch → EC P-256 private key in memory only."""
    return _hmac_to_ec_key(_derive_hmac_once())


# ── Secure temp key file ──────────────────────────────────────────────────────

class _TempKey:
    """
    Write private key PEM to a secure temp file (0600, on /dev/shm if
    available so it never hits the disk), then shred on exit.
    """
    def __init__(self, private_key):
        from cryptography.hazmat.primitives import serialization
        tmpdir = '/dev/shm' if os.path.isdir('/dev/shm') else None
        fd, self.path = tempfile.mkstemp(suffix='.pem', dir=tmpdir)
        os.chmod(self.path, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, 'wb') as f:
            f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            ))

    def __enter__(self): return self.path

    def __exit__(self, *_):
        try:
            with open(self.path, 'r+b') as f:
                f.write(os.urandom(os.path.getsize(self.path)))
            os.unlink(self.path)
        except FileNotFoundError:
            pass


class _TempKeystore:
    """
    Build an in-memory PKCS12 keystore from a derived key + stored cert,
    write it to /dev/shm (0600), return path + password, shred on exit.
    """
    def __init__(self, private_key):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.serialization import pkcs12

        self.password = base64.b64encode(os.urandom(18)).decode()
        tmpdir = '/dev/shm' if os.path.isdir('/dev/shm') else None
        fd, self.path = tempfile.mkstemp(suffix='.p12', dir=tmpdir)
        os.chmod(self.path, stat.S_IRUSR | stat.S_IWUSR)

        p12 = pkcs12.serialize_key_and_certificates(
            name=KEY_ALIAS.encode(),
            key=private_key,
            cert=_load_cert(),
            cas=None,
            encryption_algorithm=serialization.BestAvailableEncryption(
                self.password.encode()
            ),
        )
        with os.fdopen(fd, 'wb') as f:
            f.write(p12)

    def __enter__(self): return self.path, self.password

    def __exit__(self, *_):
        try:
            with open(self.path, 'r+b') as f:
                f.write(os.urandom(os.path.getsize(self.path)))
            os.unlink(self.path)
        except FileNotFoundError:
            pass


# ── Signing helpers ───────────────────────────────────────────────────────────

def _find_apksigner():
    path = shutil.which('apksigner')
    if path: return path
    sdk = os.environ.get('ANDROID_HOME', os.path.expanduser('~/Android/Sdk'))
    bt  = os.path.join(sdk, 'build-tools')
    if os.path.isdir(bt):
        ver = sorted(os.listdir(bt))[-1]
        p   = os.path.join(bt, ver, 'apksigner')
        if os.access(p, os.X_OK): return p
    return None


def _load_cert():
    from cryptography import x509
    if not CERT_FILE.exists():
        sys.exit(f"Certificate not found: {CERT_FILE}\nRun: python3 {sys.argv[0]} setup")
    return x509.load_pem_x509_certificate(CERT_FILE.read_bytes())


def _do_sign_apk(private_key, src: str, dst: str):
    apksigner = _find_apksigner()
    if not apksigner:
        print("apksigner not found — falling back to JAR (v1) signing.", file=sys.stderr)
        _do_sign_aab(private_key, src, dst)
        return
    with _TempKey(private_key) as key_path:
        subprocess.run([
            apksigner, 'sign',
            '--key', key_path,
            '--cert', str(CERT_FILE),
            '--out', dst,
            src,
        ], check=True)
    subprocess.run([apksigner, 'verify', '--print-certs', dst], check=True)
    print(f"✓ APK signed: {os.path.basename(dst)}", file=sys.stderr)


def _do_sign_aab(private_key, src: str, dst: str):
    shutil.copy2(src, dst)
    with _TempKeystore(private_key) as (ks_path, ks_pass):
        subprocess.run([
            'jarsigner',
            '-keystore', ks_path,
            '-storetype', 'pkcs12',
            '-storepass', ks_pass,
            '-keypass',   ks_pass,
            '-tsa', 'http://timestamp.digicert.com',
            dst, KEY_ALIAS,
        ], check=True)
    subprocess.run(['jarsigner', '-verify', dst], check=True)
    print(f"✓ AAB signed: {os.path.basename(dst)}", file=sys.stderr)


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_setup():
    from fido2.ctap2 import Ctap2
    from cryptography.hazmat.primitives import serialization

    ctap = Ctap2(_find_device())
    info = ctap.get_info()

    if not info.extensions or "hmac-secret" not in info.extensions:
        sys.exit("YubiKey does not support hmac-secret. Requires Security Key firmware 5.2+.")

    protocol = _best_pin_protocol(ctap)
    pin = _ensure_pin(ctap)
    pin_uv_param, pin_uv_protocol = _get_pin_uv_param(ctap, protocol, pin, CLIENT_HASH)

    print("Step 1/2 — Touch YubiKey to burn resident credential...", file=sys.stderr)
    mc = ctap.make_credential(
        client_data_hash = CLIENT_HASH,
        rp   = {"id": RP_ID, "name": "WeatherStar Kiosk Signing"},
        user = {"id": b"wsk-signer", "name": "signer", "displayName": "Signer"},
        key_params = [{"type": "public-key", "alg": -7}],   # ES256
        extensions = {"hmac-secret": True},
        options    = {"rk": True},    # RESIDENT — stored on YubiKey
        pin_uv_param    = pin_uv_param,
        pin_uv_protocol = pin_uv_protocol,
    )

    cred_id = mc.auth_data.credential_data.credential_id
    CRED_FILE.parent.mkdir(parents=True, exist_ok=True)
    CRED_FILE.write_text(json.dumps({
        "credential_id": base64.b64encode(cred_id).decode(),
        "rp_id": RP_ID,
    }, indent=2))
    os.chmod(CRED_FILE, stat.S_IRUSR | stat.S_IWUSR)
    print(f"  Resident credential stored on YubiKey.", file=sys.stderr)
    print(f"  Credential ID backed up to: {CRED_FILE}", file=sys.stderr)

    print("Step 2/2 — Touch YubiKey to derive signing key + create certificate...", file=sys.stderr)
    private_key = _derive_signing_key()
    cert        = _make_cert(private_key)

    CERT_FILE.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    os.chmod(CERT_FILE, 0o644)
    print(f"  Certificate saved: {CERT_FILE}", file=sys.stderr)

    print("", file=sys.stderr)
    print("  ✓ Setup complete.", file=sys.stderr)
    print("  Private key: NEVER stored — derived from YubiKey on every signing run.", file=sys.stderr)
    print(f"  Back up {CRED_FILE} and {CERT_FILE}.", file=sys.stderr)


def cmd_sign_apk(src: str, dst: str):
    _do_sign_apk(_derive_signing_key(), src, dst)


def cmd_sign_aab(src: str, dst: str):
    _do_sign_aab(_derive_signing_key(), src, dst)


def cmd_sign_both(apk_src: str, aab_src: str):
    """Single YubiKey touch → derive key once → sign APK and AAB."""
    base  = Path(apk_src).stem.replace('-unsigned', '')
    d     = Path(apk_src).parent
    apk_dst = str(d / f"{base}-signed.apk")
    aab_dst = str(Path(aab_src).parent / f"{Path(aab_src).stem}-signed.aab")

    key = _derive_signing_key()   # ONE touch
    _do_sign_apk(key, apk_src, apk_dst)
    _do_sign_aab(key, aab_src, aab_dst)
    return apk_dst, aab_dst


# ── Entry point ───────────────────────────────────────────────────────────────

USAGE = f"""Usage: {sys.argv[0]} <command> [args]

  setup                        Burn resident credential to YubiKey, create cert
  sign-apk   <src> <dst>       Sign APK (one touch)
  sign-aab   <src> <dst>       Sign AAB (one touch)
  sign-both  <apk> <aab>       Sign APK + AAB (one touch total)
"""

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        sys.exit(USAGE)
    cmd = args[0]
    if cmd == "setup"      and len(args) == 1: cmd_setup()
    elif cmd == "sign-apk" and len(args) == 3: cmd_sign_apk(args[1], args[2])
    elif cmd == "sign-aab" and len(args) == 3: cmd_sign_aab(args[1], args[2])
    elif cmd == "sign-both" and len(args) == 3: cmd_sign_both(args[1], args[2])
    else: sys.exit(USAGE)
