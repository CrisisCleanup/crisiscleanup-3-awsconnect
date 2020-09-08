/**
 * operations.js
 * Client Operations
 */

import { expiredFilter, Expressions } from '../../utils/dynamo';

// Get Client
export const getClient = ({ dbTable, userId }) => ({
  TableName: dbTable,
  Key: {
    user_id: String(userId),
  },
});

// Update Client
export const updateClient = ({ dbTable, connectionId, userId, type }) => ({
  TableName: dbTable,
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
export const queryByType = (dbTable, query) => ({
  TableName: dbTable,
  ...expiredFilter(
    Expressions([{ key: 't', name: 'client_type', value: query }]),
  ),
  KeyConditionExpression: '#T = :t',
  IndexName: 'type-index',
});

// Delete Client
export const deleteClient = ({ dbTable, userId }) => ({
  TableName: dbTable,
  Key: {
    user_id: userId,
  },
});

// Query by Connection Id
export const queryByConnection = ({ dbTable, connectionId }) => ({
  TableName: dbTable,
  ...expiredFilter(
    Expressions([{ key: 'c', name: 'connection_id', value: connectionId }]),
  ),
  IndexName: 'connection-index',
  KeyConditionExpression: '#C = :c',
});
