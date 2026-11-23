# Encryption and contacts, for developers

## Encryption

- OpenPGP.js 6.3.2 is vendored unchanged at `web/vendor/openpgp/openpgp.min.mjs` and
  reached only through `apps/web/src/features/encryption/engine.ts`. Keys are written as
  version 4 EdDSA/ECDH (algorithms 22 and 18); RFC 9580 keys are read, never made,
  because GnuPG 2.5.18 refuses them. GnuPG's OCB packet is read, never written.
- Passphrases are stretched with iterated SHA-256 at the format's maximum (65,011,712
  bytes per guess). The server refuses a private key not encrypted under a stretched
  passphrase, and private material offered as a public key.
- An encrypted page is an ordinary page whose content is one `pgp-message` code block
  holding an armoured message of
  `{ "outpost": "encrypted-page", "version": 1, "content": <ProseMirror doc> }`, so it
  survives export, trash, backup and drives as ciphertext. The server accepts a swap of
  text for ciphertext (or back, when stated) only on top of the named version; encrypting
  scrubs the text from the database, WAL and FTS tables (`encryptedNoteArmor`,
  `scrubbing`).
- One-time pad letters come from `crypto.getRandomValues`, rejecting bytes ≥ 234.
- The pads and the Vigenère square are drawn by the print kit
  (`apps/web/src/features/encryption/kit-aids.ts` on `apps/web/src/features/print-kit/`; see
  [printed-pages.md](printed-pages.md)). Print detection is in `apps/web/src/lib/printing.ts`.
- `engine.test.ts` round-trips keys, messages, files, signatures and revocations with a
  throwaway GnuPG 2.5.18 keyring when `gpg` is installed; `fixtures/` holds files gpg wrote.
  Ciphers are tested against the worked examples on their Wikipedia pages (revisions read
  16 November 2026).

## Contacts

- vCard is read by `apps/server/src/modules/contacts/vcard.ts`: 2.1 folding,
  quoted-printable and `CHARSET=`, windows-1252 and UTF-16 files, `itemN.` groups and
  Apple's `_$!<Label>!$_`, `X-ABRELATEDNAMES`, `X-ABShowAs`, `X-APPLE-OMIT-YEAR`. Unknown
  properties are kept and written back; fields without a vCard property go out as
  `X-OUTPOST-…`.
- CardDAV routes are in [api.md](../api.md). CTag and ETag are derived from the cards, so
  they survive restarts and restores; `sync-collection` (RFC 6578) is not offered.
- Sources: RFC 6352, 6764, 6578, 2426, 6350; DAVx⁵ manual; sabre/dav client notes; the
  Nextcloud manual; Chrome's Contact Picker article and MDN compatibility data; Apple's
  and Google's help pages on exporting contacts (all read 16 November 2026).
