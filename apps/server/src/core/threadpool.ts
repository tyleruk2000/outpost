/**
 * How many threads Node keeps for file work, set before anything uses one (Node reads it
 * once, when the first file is opened).
 *
 * Every file read is done on one of these threads, the map's tiles among them. A network
 * share that stops answering does not fail its reads at once: each waits on its thread
 * for the share to come back, about ten seconds a time on a Raspberry Pi with an SMB
 * share switched off (18 November 2026). With Node's four, four such reads were enough
 * for the map, whose files were on the device's own disk, to wait behind them. Sixteen
 * leave room for the map while a share is out of reach. It can be set from outside, as
 * Node allows; this only fills it in when it is not.
 */
process.env.UV_THREADPOOL_SIZE ??= "16";
