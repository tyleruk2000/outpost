import type { ReactNode } from "react";

/**
 * A table from a document. It keeps its own width and scrolls inside its box, so a
 * phone never scrolls the page sideways.
 */
export function DataTable({ label, header, body }: { label: string; header: ReactNode[]; body: ReactNode[][] }) {
  return (
    <section
      className="doc-table scroll-quiet"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
      tabIndex={0}
      aria-label={`Table: ${label}`}
    >
      <table>
        <thead>
          <tr>
            {header.map((cell, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their order
              <th key={index} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond their order
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: columns have no identity beyond their order
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
