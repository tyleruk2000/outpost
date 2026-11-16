/**
 * Progress reports for a file being encrypted or decrypted, which stop when the work does.
 *
 * The engine counts bytes as the file's stream is read, and a stream that is given up part
 * of the way (the wrong passphrase is found out from the start of the file) can still pass
 * a piece through, and report it, after the work has failed. On a busy machine that report
 * came after the screen had put the button back, and the screen then showed the file being
 * decrypted for good, with its button busy, beside the error.
 */
export function progressUntilDone(set: (read: number | null) => void): { progress(read: number): void; done(): void } {
  let finished = false;
  return {
    progress(read) {
      if (!finished) set(read);
    },
    done() {
      finished = true;
      set(null);
    },
  };
}
