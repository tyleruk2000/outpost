# Security policy

## Supported versions

Security fixes are made to the latest release. Please update to it before reporting,
and say which version you tested (it is shown under **Settings → This installation**
and by `GET /api/health`).

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Anything older | No |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub: on the repository's **Security** tab, choose
**Report a vulnerability**. This opens a private security advisory that only you and
the maintainers can see.

### What to include

- The Outpost version, and how you run it: Docker Compose, from source, the packaged
  app, or a portable drive.
- The relevant settings: whether LAN access and sign-in are on, and whether a reverse
  proxy is in front.
- What an attacker needs to start with (no account, a member account, a file they can
  get you to upload or import, a page they can get you to visit, a catalogue manifest
  they control).
- Steps to reproduce, ideally with a small proof of concept.
- What the attacker gains.

Please do not include other people's data, and do not test against an installation
that is not yours.

### What to expect

- A reply in the advisory. Outpost is maintained by volunteers, so please allow a few
  days.
- If the report is confirmed, the maintainers will work on a fix and tell you, in the
  advisory, when a fixed version is available.
- If it is not treated as a vulnerability, an explanation of why.

There is no bug bounty.

## Scope

[docs/security.md](docs/security.md) describes what Outpost is designed to protect
against, what it is not, and where each control lives in the code. Reports are most
useful when they show one of those protections failing, for example:

- a page on another site reading from or changing an Outpost;
- access without signing in when sign-in is on, or a member doing what only an
  administrator may;
- an uploaded, imported or downloaded file running script in Outpost's origin, or
  writing outside the folders it belongs in;
- content from a reference collection escaping its sandbox;
- Outpost being made to fetch from a private address;
- the server contacting the internet without a person asking it to.

Things the design does not claim to prevent, and which are therefore not
vulnerabilities on their own: what an administrator can do; reading an unencrypted
drive someone has physical access to; interception on a network when no HTTPS proxy is
in use; and local programs on the same computer when sign-in is off. If you think one
of those limits is wrong, an ordinary issue is the right place to say so.

Vulnerabilities in kiwix-serve, Node.js or other dependencies should be reported to
those projects. Tell us as well if Outpost's use of them makes things worse.
