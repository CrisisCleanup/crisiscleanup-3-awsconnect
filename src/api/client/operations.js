/**
 * operations.js
 * Client Operations
 */

import { expiredFilter, Expressions } from '../../utils/dynamo';

// Get Client
export const getClient = ({ userId }) => ({
  Key: {
    user_id: userId,
  },
});

// Update Client
export const updateClient = ({ connectionId, userId, type }) => ({
  ...Expressions([
    { key: 'c', name: 'connection_id', value: connectionId },
    { key: 't', name: 'client_type', value: type },
    // expire any clients who do not recieve a heartbeat
    // within 3m
    { key: 'e', name: 'ttl', value: Math.floor(Date.now() / 1000) + 60 * 3 },
  ]),
  Key: {
    user_id: String(userId),
  },
  UpdateExpression: 'set #T = :t, #E = :e, #C = :c',
});

// Query by type
export const queryByType = (query) => ({
  ...expiredFilter(
    Expressions([{ key: 't', name: 'client_type', value: query }]),
  ),
  KeyConditionExpression: '#T = :t',
  IndexName: 'type-index',
});

// Delete Client
export const deleteClient = ({ userId }) => ({
  Key: {
    user_id: userId,
  },
});
