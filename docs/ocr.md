# Scanned pages and images (OCR)

Part of the search guide, which starts at [Search](search.md).

A scanned PDF or a photo of a notice has no text to search until something reads the
picture. Outpost can do that on this machine. Nothing is sent or downloaded. It is **off
by default**, because it is slow and makes mistakes.

## Using it

- A document with scanned pages, or an image, offers **Read text from the scanned pages**
  (or **Read text from this image**) above its pages and under **Details → Text for
  search**. It runs in the background with progress, one document at a time, and can be
  stopped.
- **Settings → Reading documents → Read text from scans automatically** reads every new
  document as it is added.
- The text is then found by search, page by page, and **Show the text** shows exactly what
  was read.
- Only pages with no text of their own are read. Stopping keeps the pages read so far and
  offers **Read the remaining scanned pages**; a restart carries on. **Read the scanned
  pages again** starts over.
- The original file is only ever read.

## What to expect

Print reads well, handwriting badly; poor scans, small type, tables and other languages
bring errors. A clean page takes about 3 seconds on a fast laptop, many times longer on a
Raspberry Pi. Treat the text as a way to find the pages; the pages remain the record.

## Limits

| Limit | Value |
| --- | --- |
| Pages read in one go | 1,000 scanned pages of one PDF; the rest are offered afterwards. |
| Largest picture | 40 million pixels (A4 at 600 dpi is about 35 million). Larger is skipped. |
| Resolution read at | Up to 300 dpi and 12 million pixels; finer scans are scaled down. |
| Largest files | Images 64 MB, PDFs 512 MB. |
| Image types | PNG, JPEG, GIF (first frame), WebP. Not SVG. |
| Confidence | A page scoring below 50 of 100 is treated as having no text. |

It does not read text drawn as shapes in a PDF, does not keep layout (tables come out as
lines of words), and tries a page the other ways up only when its first reading scores
badly, taking up to four times as long.

## Other languages

English is built in. For another language:

1. Get `<code>.traineddata` (for example `deu.traineddata`) from Tesseract's
   [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) or `tessdata_best`
   collection (`.traineddata.gz` works too).
2. Put it in `<data directory>/ocr/tessdata/`.
3. Set `ocr.languages` to the codes joined by `+`, most likely first:

```bash
curl -X PATCH "http://localhost:8080/api/settings" \
  -H "X-Outpost-Request: 1" -H "Content-Type: application/json" \
  -d '{"ocr.languages": "deu+eng"}'
```

More languages read more slowly. Documents already read are not read again by themselves:
use **Read the scanned pages again**. Language files are not in backups or on portable
drives; copy them yourself.
