/**
 * Outpost's release key: the minisign public key that every release is signed with.
 * The same text is in deploy/release-key.pub, which deploy/pi/install.sh gives to the
 * helper that installs updates on the host (a test holds the two to each other).
 *
 * Empty until the owner makes the key (docs/development/releases.md). While it is empty
 * no release can be checked, and the Updates section says so; nothing is installed.
 * Someone building Outpost themselves can set OUTPOST_RELEASE_KEY to their own key's text.
 */
export const RELEASE_KEY = "";
