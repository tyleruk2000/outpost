/** A minimal, valid PDF with one page per entry of `pages`, each entry being lines of text. */
export function buildPdf(pages: string[][]): Buffer {
  const quoted = (text: string) => `(${text.replace(/([\\()])/g, "\\$1")})`;
  const objects: string[] = [];
  const pageId = (index: number) => 4 + index * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((lines, index) => {
    const stream = `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((line) => `${quoted(line)} Tj T*`).join(" ")} ET`;
    objects[pageId(index)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(index) + 1} 0 R >>`;
    objects[pageId(index) + 1] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, "latin1");
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** What every page of the file says in words, read by pdf.js as a reader would (the print kit's text is not plain in the file). Lines run together, spaces collapsed. */
export async function pdfWords(bytes: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const reading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true });
  const document = await reading.promise;
  const pages: string[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const content = await (await document.getPage(number)).getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await reading.destroy();
  return pages.join(" ").replace(/\s+/g, " ");
}

/** Each page of a file as pdf.js reads it: its size in points, and each run of text in the order it is drawn. */
export async function pdfPages(bytes: Buffer): Promise<Array<{ width: number; height: number; items: string[] }>> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const reading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true });
  const document = await reading.promise;
  const pages: Array<{ width: number; height: number; items: string[] }> = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push({
      width: Math.round(page.view[2]! * 100) / 100,
      height: Math.round(page.view[3]! * 100) / 100,
      items: content.items.map((item) => ("str" in item ? item.str : "")).filter((words) => words.trim() !== ""),
    });
  }
  await reading.destroy();
  return pages;
}

/**
 * Where each picture is drawn, in the order drawn: its width and height on the page in points, worked out by pdf.js from
 * the transforms around it (the print kit draws a map inside its SVG, so the size is a product of several).
 */
export async function pdfPicturesPlaced(bytes: Buffer): Promise<Array<{ width: number; height: number }>> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const reading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, disableFontFace: true });
  const document = await reading.promise;
  const placed: Array<{ width: number; height: number }> = [];
  type Matrix = [number, number, number, number, number, number];
  const times = (m: Matrix, n: Matrix): Matrix => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  for (let number = 1; number <= document.numPages; number += 1) {
    const list = await (await document.getPage(number)).getOperatorList();
    let matrix: Matrix = [1, 0, 0, 1, 0, 0];
    const saved: Matrix[] = [];
    list.fnArray.forEach((fn, index) => {
      if (fn === OPS.save) saved.push(matrix);
      else if (fn === OPS.restore) matrix = saved.pop() ?? matrix;
      else if (fn === OPS.transform) matrix = times(matrix, list.argsArray[index] as Matrix);
      else if (fn === OPS.paintImageXObject)
        placed.push({ width: Math.hypot(matrix[0], matrix[1]), height: Math.hypot(matrix[2], matrix[3]) });
    });
  }
  await reading.destroy();
  return placed;
}
