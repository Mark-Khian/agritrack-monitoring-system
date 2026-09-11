/**
 * In-memory SSE hub for Farm Weather Location invalidation only.
 * Single Node process — no Redis/pub-sub.
 */
'use strict';

const clients = new Set();

const FARM_LOCATION_CHANGED_PAYLOAD =
    'event: farm-location-changed\ndata: {"type":"farm_location_changed"}\n\n';

const addClient = (res) => {
    clients.add(res);
};

const removeClient = (res) => {
    clients.delete(res);
};

const getClientCount = () => clients.size;

/**
 * Notify all connected Weather clients to refetch via authorized GET /weather.
 * Payload contains no coordinates, secrets, or PII.
 */
const broadcastFarmLocationChanged = () => {
    for (const res of [...clients]) {
        try {
            res.write(FARM_LOCATION_CHANGED_PAYLOAD);
        } catch {
            clients.delete(res);
        }
    }
};

module.exports = {
    addClient,
    removeClient,
    getClientCount,
    broadcastFarmLocationChanged,
    FARM_LOCATION_CHANGED_PAYLOAD,
};
