const RETRYABLE_ERRNOS = new Set([1213, 1205]);
const RETRYABLE_CODES = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

const isRetryableTransactionError = (err) => {
    if (!err) return false;
    if (RETRYABLE_CODES.has(err.code) || RETRYABLE_ERRNOS.has(Number(err.errno))) {
        return true;
    }
    const message = String(err.message || '');
    return /deadlock found when trying to get lock/i.test(message)
        || /lock wait timeout exceeded/i.test(message);
};

const isDuplicateKeyError = (err) => (
    err?.code === 'ER_DUP_ENTRY' || Number(err?.errno) === 1062
);

module.exports = {
    isRetryableTransactionError,
    isDuplicateKeyError,
};
