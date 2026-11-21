# Storage, backups and HTTPS: for developers

## The protected backup file

So another program can read one. Version 1; integers big-endian. Code:
`apps/server/src/modules/backup/sealed.ts`; `apps/server/test/backup-protection.test.ts`
opens a backup with a reader written from this section alone.

A header, then the zip an unprotected backup would have been, encrypted in chunks.

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 8 | ASCII `OPBACKUP`. |
| 8 | 1 | Version: `1`. |
| 9 | 4 | `H`, header length: `210 + M`. |
| 13 | 4 | `C`, zip bytes per chunk but the last (Outpost writes 65,536). |
| 17 | 32 | Public key the backup is encrypted to (X25519, raw). |
| 49 | 32 | Ephemeral public key for this file (X25519, raw). |
| 81 | 1 | scrypt `N` = 2^this, 15 to 20 (Outpost writes 15 to 19). |
| 82 | 1 | scrypt `r`: `8`. |
| 83 | 1 | scrypt `p`: `1`. |
| 84 | 32 | scrypt salt. |
| 116 | 12 | Nonce of the wrapped private key. |
| 128 | 48 | Wrapped private key: 32 encrypted bytes, 16-byte tag. |
| 176 | 2 | `M`, manifest length, at most 16,384. |
| 178 | `M` | The backup's `manifest.json`, UTF-8, in the clear (so it can be listed without the passphrase). |
| 178 + `M` | 32 | SHA-256 of every header byte before it. |

From offset `H`: chunks, each its ciphertext then a 16-byte tag; all but the last hold
exactly `C` zip bytes, the last 1 to `C` (0 only for an empty zip). Chunk count =
ceil((file length − H) / (C + 16)).

To open:

1. Passphrase bytes: UTF-8 after NFC normalisation, untrimmed.
2. Wrapping key = `scrypt(passphrase, salt, N, r, p)`, 32 bytes.
3. Private key = ChaCha20-Poly1305 (RFC 8439) decryption of the wrapped key, with that
   nonce and associated data ASCII `outpost-backup-v1 key` + the 32 bytes at offset 17.
   A bad tag means a wrong passphrase. Its X25519 public key must equal offset 17.
4. Shared secret = X25519(private key, offset 49).
5. File key = HKDF-SHA-256 (RFC 5869), 32 bytes, salt = offset 49 bytes + offset 17
   bytes, info = ASCII `outpost-backup-v1 file` + the header's closing SHA-256.
6. Each chunk: ChaCha20-Poly1305 under the file key, no associated data, nonce = chunk
   number from 0 as an 11-byte integer + one byte, `1` for the last chunk else `0`. Any
   bad tag refuses the whole file.

The last-chunk byte catches truncation on a chunk boundary; the numbering catches
swapped, dropped or repeated chunks; the header checksum catches accidental damage
before a passphrase is tried, and, being in the file key, makes a deliberately altered
header open nothing. A salt or wrapped key altered with the checksum fixed looks like a
wrong passphrase. Readers refuse `N` above 2^20, chunks under 4 KiB or over 4 MiB, and
other `r` or `p`. Key derivation is tuned to about a second and 32 to 512 MiB on the
computer that set the passphrase.

## Storage internals

- **Read-back check**: a CRC-32 per megabyte handed to storage is kept in memory (about
  4 kB per GB) and compared in the same pass that computes the final SHA-256.
- **Container detection** (`containerReason` in `apps/server/src/core/local.ts`):
  `OUTPOST_IN_CONTAINER`, `/.dockerenv`, `/run/.containerenv`, the `container`
  variable (Podman, LXC, systemd-nspawn), `KUBERNETES_SERVICE_HOST`, or a container's
  control group or root file system. Away from Linux only the variables count. Tested
  against made-up files (`test/storage-shares.test.ts`, `test/local.test.ts`).
- **Share listing on a Mac**: Outpost reads the share list itself over one SMB 2/3
  connection with NTLM; macOS does the mounting.
- **Database figures** come from SQLite's `dbstat` on a read-only connection in a worker
  thread; checks (`quick_check`, `integrity_check`) run on the `database` queue the same
  way. `VACUUM` holds the write lock; requests that may write are counted from start to
  finish so a reclaim can wait for them. Code: `apps/server/src/modules/database/`.

## HTTPS internals

- Outpost's authority: RSA 3072, ten years, critical name constraints, path length 0,
  server authentication only. Server certificate: ECDSA P-256, from a day before issue
  to 397 days after. Code: `apps/server/src/modules/https/`; tests `https.test.ts`,
  `https-own.test.ts`, `e2e/tests/https.spec.ts`.
- PKCS#12 is read by `modules/https/pkcs12.ts` (Node will not return the key from a
  `.pfx`), with Node's PBKDF2, AES and triple DES. The integrity MAC is not checked; the
  key is checked against the certificate.
- Whether a certificate is public is judged against Node's bundled Mozilla root list.
- The device trust steps in Settings (`apps/web/src/features/settings/https-steps.tsx`)
  were read in November 2026 from: Apple
  [102400](https://support.apple.com/en-us/102400),
  [102390](https://support.apple.com/en-us/102390),
  [Keychain Access guide](https://support.apple.com/guide/keychain-access/change-the-trust-settings-of-a-certificate-kyca11871/mac),
  `security help add-trusted-cert` on macOS 15.6.1; Google
  [2844832](https://support.google.com/pixelphone/answer/2844832) and the
  [Android Settings strings](https://android.googlesource.com/platform/packages/apps/Settings/+/refs/heads/main/res/values/strings.xml);
  Microsoft [certutil](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil)
  and [Import-Certificate](https://learn.microsoft.com/en-us/powershell/module/pki/import-certificate);
  [Ubuntu](https://documentation.ubuntu.com/server/how-to/security/install-a-root-ca-certificate-in-the-trust-store/),
  [Fedora](https://docs.fedoraproject.org/en-US/quick-docs/using-shared-system-certificates/),
  [Arch](https://wiki.archlinux.org/title/Transport_Layer_Security),
  [SUSE](https://documentation.suse.com/smart/security/html/tls-certificates/index.html);
  Chromium's [Linux cert management](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md)
  and [Root Store FAQ](https://chromium.googlesource.com/chromium/src/+/main/net/data/ssl/chrome_root_store/faq.md);
  Mozilla's [certificate authorities](https://support.mozilla.org/en-US/kb/setting-certificate-authorities-firefox)
  page and Firefox's own interface strings. Labels taken only from program source, not
  a help page: Android's **CA certificate**, **Install anyway**, **Trusted credentials**;
  Chrome's certificate manager; Firefox's import dialog.

## Variables for the test suites only

Leave these unset.

| Variable | Use |
| --- | --- |
| `OUTPOST_P533_BUILD_MANIFEST` | JSON replacing what **Build the P.533 engine** fetches (`BuildManifest` in `modules/propagation/p533/build.ts`). |
| `OUTPOST_P533_MAPS_MANIFEST` | JSON of map files for the second HF model (shape of `maps` in `modules/propagation/p533/manifest.json`). |
| `OUTPOST_VOACAP_DATA_MANIFEST` | JSON in the shape of `engines/voacap/coefficients.json`, for the end-to-end suite's file server. |

The suites also set `OUTPOST_OLLAMA_ADDRESSES` so they never reach a real Ollama.
