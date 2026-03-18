#!/usr/bin/env python3
"""
fido2_keysign.py — Derive Android signing password from YubiKey FIDO2 HMAC-secret.

Requires: python3-fido2 >= 1.0   (dnf install python3-fido2)
Works with: YubiKey Security Key NFC, firmware 5.2+

How it works:
  The YubiKey computes HMAC-SHA256(device_secret, salt) where device_secret is
  burned in at manufacture and never leaves the key. With a fixed salt every
  invocation returns the same 32-byte secret — deterministic, hardware-bound,
  touch-required. That secret is used as the Android keystore password.

Commands:
  setup   One-time: create FIDO2 credential, save to CRED_FILE
  derive  Touch YubiKey → print 64-char hex password to stdout
"""

import sys
import json
import base64
import hashlib
from pathlib import Path

CRED_FILE   = Path.home() / ".android" / "weatherstar-fido2.json"
RP_ID       = "weatherstarkiosk.signing"

# Both values are fixed so the derived password is deterministic.
# Security comes from the YubiKey's internal device secret, not these constants.
CLIENT_HASH = hashlib.sha256(b"weatherstarkiosk:android:client-data:v1").digest()
HMAC_SALT   = hashlib.sha256(b"weatherstarkiosk:android:hmac-salt:v1").digest()  # 32 bytes


# ── Helpers ───────────────────────────────────────────────────────────────────

def find_device():
    from fido2.hid import CtapHidDevice
    devs = list(CtapHidDevice.list_devices())
    if not devs:
        sys.exit("No FIDO2 device found. Plug in your YubiKey.")
    return devs[0]


def get_pin_protocol(ctap):
    """Return the best available PinProtocol instance."""
    from fido2.ctap2.pin import PinProtocolV1, PinProtocolV2
    info = ctap.get_info()
    versions = info.pin_uv_auth_protocols or [1]
    return PinProtocolV2() if 2 in versions else PinProtocolV1()


# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_setup():
    from fido2.ctap2 import Ctap2

    dev  = find_device()
    ctap = Ctap2(dev)
    info = ctap.get_info()

    if not info.extensions or "hmac-secret" not in info.extensions:
        sys.exit("This YubiKey does not support the hmac-secret extension.\n"
                 "Requires Security Key firmware 5.2+ or YubiKey 5 series.")

    print("Touch your YubiKey to create the signing credential...", file=sys.stderr)

    mc = ctap.make_credential(
        client_data_hash=CLIENT_HASH,
        rp={"id": RP_ID, "name": "WeatherStar Kiosk Signing"},
        user={"id": b"wsk-signer", "name": "signer", "displayName": "Signer"},
        key_params=[{"type": "public-key", "alg": -7}],  # ES256
        extensions={"hmac-secret": True},
    )

    cred_id = mc.auth_data.credential_data.credential_id
    CRED_FILE.parent.mkdir(parents=True, exist_ok=True)
    CRED_FILE.write_text(json.dumps({
        "credential_id": base64.b64encode(cred_id).decode(),
        "rp_id": RP_ID,
    }, indent=2))
    print(f"✓ Credential saved: {CRED_FILE}", file=sys.stderr)
    print("  Keep this file — it is needed to unlock the signing key.", file=sys.stderr)


def cmd_derive():
    from fido2.ctap2 import Ctap2
    from fido2.ctap2.pin import ClientPin

    if not CRED_FILE.exists():
        sys.exit(f"No credential found. Run first: python3 {sys.argv[0]} setup")

    data    = json.loads(CRED_FILE.read_text())
    cred_id = base64.b64decode(data["credential_id"])
    rp_id   = data.get("rp_id", RP_ID)

    dev      = find_device()
    ctap     = Ctap2(dev)
    protocol = get_pin_protocol(ctap)

    # HMAC-secret requires ECDH key agreement (same channel as PIN UV,
    # but we use it only to encrypt the HMAC salt — no PIN needed).
    client_pin              = ClientPin(ctap, protocol)
    key_agreement, shared   = client_pin.get_shared_secret()

    salt_enc  = protocol.encrypt(shared, HMAC_SALT)
    salt_auth = protocol.authenticate(shared, salt_enc)

    allow_list = [{"type": "public-key", "id": cred_id}]

    print("Touch your YubiKey to authorize signing...", file=sys.stderr)

    result = ctap.get_assertion(
        rp_id=rp_id,
        client_data_hash=CLIENT_HASH,
        allow_list=allow_list,
        extensions={
            "hmac-secret": {
                1: key_agreement,   # keyAgreement  (our ECDH public key)
                2: salt_enc,        # saltEnc        (encrypted HMAC salt)
                3: salt_auth,       # saltAuth       (MAC over saltEnc)
                4: protocol.VERSION,# pinUvAuthProtocol
            }
        },
        options={"up": True},
    )

    raw_ext = result.auth_data.extensions or {}
    enc_out = raw_ext.get("hmac-secret")
    if not enc_out:
        sys.exit("YubiKey did not return an HMAC-secret. "
                 "Ensure the credential was created with hmac-secret enabled.")

    secret = protocol.decrypt(shared, enc_out)  # 32 bytes
    # Print as 64-char hex to stdout (used as keystore password by sign-release.sh)
    print(secret.hex())


# ── Entry point ───────────────────────────────────────────────────────────────

COMMANDS = {"setup": cmd_setup, "derive": cmd_derive}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "derive"
    fn  = COMMANDS.get(cmd)
    if not fn:
        sys.exit(f"Usage: {sys.argv[0]} [setup|derive]")
    fn()
