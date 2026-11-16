Keys for the tests in `encryption.test.ts`. They protect nothing: their passphrase is
`test passphrase for fixtures`.

Made on 2026-11-16 with OpenPGP.js 6.3.2 (`curve25519-*`, `rsa4096-*`, `ed25519-new-*`,
`v6-*`) and GnuPG 2.5.18 (`gnupg-*`, `two-keys.asc`). Each `*-fingerprint.txt` holds the
fingerprint as the program that made the key reports it.

- `curve25519-*`: EdDSA and ECDH on Curve25519 as GnuPG writes them (algorithms 22 and 18).
- `ed25519-new-*`: the same curves in the newer encoding of RFC 9580 (algorithms 27 and 25).
- `v6-*`: a version 6 key.
- `*-private-unprotected.asc`: private keys with no passphrase, which the server must refuse.
- `curve25519-revocation.asc`: a revocation certificate, which is a signature and not a key.
- `two-keys.asc`: two public keys in one armoured block.
