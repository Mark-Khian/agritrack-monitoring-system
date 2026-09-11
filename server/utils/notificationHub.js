/**
 * In-memory SSE hub for notification invalidation only.
 * Single Node process — no Redis/pub-sub.
 */
'use strict';

const clients = new Set();

const NOTIFICATIONS_CHANGED_PAYLOAD =
    'event: notifications-changed\ndata: {"type":"notifications_changed"}\n\n';

const addClient = (res) => {
    clients.add(res);
};

const removeClient = (res) => {
    clients.delete(res);
};

const getClientCount = () => clients.size;

/**
 * Notify connected clients to refetch via authorized GET /notifications.
 * Payload contains no notification content, PII, or secrets.
 */
const broadcastNotificationsChanged = () => {
    for (const res of [...clients]) {
        try {
            res.write(NOTIFICATIONS_CHANGED_PAYLOAD);
        } catch {
            clients.delete(res);
        }
    }
};

module.exports = {
    addClient,
    removeClient,
    getClientCount,
    broadcastNotificationsChanged,
    NOTIFICATIONS_CHANGED_PAYLOAD,
};
