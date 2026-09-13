const mongoose = require("mongoose");

/**
 * Runs `fn(session)` inside a MongoDB transaction and retries it if MongoDB
 * reports a transient error (most commonly a WriteConflict from two
 * transactions touching the same document at once — expected behavior
 * under concurrent bidding, not a bug).
 *
 * Without this, a legitimate second bid that loses a write race gets a raw
 * driver error surfaced to the client instead of a clean retry.
 *
 * Usage (replaces the manual startSession/startTransaction/commit/abort
 * boilerplate at the top of each controller):
 *
 *   const result = await withTransaction(async (session) => {
 *     const player = await Player.findOne({ ... }).session(session);
 *     ...
 *     await player.save({ session });
 *     return player;
 *   });
 *
 * Throws the original error once retries are exhausted or the error isn't
 * retryable, so your existing try/catch + res.status(400) handling in the
 * controller stays exactly as-is.
 */
const withTransaction = async (fn, { maxRetries = 3 } = {}) => {
    let attempt = 0;

    while (true) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            const result = await fn(session);
            await session.commitTransaction();
            return result;
        } catch (error) {
            await session.abortTransaction().catch(() => { });

            const isTransient =
                error?.errorLabels?.includes?.("TransientTransactionError") ||
                (typeof error?.hasErrorLabel === "function" && error.hasErrorLabel("TransientTransactionError"));

            if (isTransient && attempt < maxRetries) {
                attempt += 1;
                // Small jittered backoff so a burst of conflicting bids
                // doesn't immediately collide again on retry.
                await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 50));
                continue;
            }

            throw error;
        } finally {
            await session.endSession();
        }
    }
};

module.exports = withTransaction;