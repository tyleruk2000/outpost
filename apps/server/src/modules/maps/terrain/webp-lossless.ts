/** The lossless WebP reader lives in the shared package, so that a phone can read kept terrain tiles the same way. */
export { type DecodedImage, decodeLosslessWebp, ImageDecodeError } from "@outpost/shared";
