/**
 * In-memory SSE hub for Plantings invalidation only.
 * Single Node process — no Redis/pub-sub.
 */
'use strict';

const clients = new Set();

const PLANTINGS_CHANGED_PAYLOAD =
    'event: plantings-changed\ndata: {"type":"plantings_changed"}\n\n';

const addClient = (res) => {
    clients.add(res);
};

const removeClient = (res) => {
    clients.delete(res);
};

const getClientCount = () => clients.size;

/**
 * Notify connected clients to refetch via authorized GET /plantings.
 * Payload contains no planting records, secrets, or PII.
 */
const broadcastPlantingsChanged = () => {
    for (const res of [...clients]) {
        try {
            res.write(PLANTINGS_CHANGED_PAYLOAD);
        } catch {
            clients.delete(res);
        }
    }
};

module.exports = {
    addClient,
    removeClient,
    getClientCount,
    broadcastPlantingsChanged,
    PLANTINGS_CHANGED_PAYLOAD,
};
