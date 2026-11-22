/**
 * Time this thread has spent working, in milliseconds, for tests that hold code to a
 * speed. Unlike the clock it does not run on while the machine is busy with other
 * processes (the other suites, a build), so a bound on it fails only when the code itself
 * does too much work: a pass that grows with the square of the input, or a long hold of
 * the server's thread. Work done on other threads (workers, file reads) is not counted.
 */
export function threadMs(): number {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
}
