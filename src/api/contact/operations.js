/* eslint-disable camelcase */
/**
 * queries.js
 * Contact DB Operations
 */

import { expiredFilter, Expressions } from '../../utils/dynamo';

// Create Contact
export const createContact = ({ dbTable, contact_id, state }) => ({
  TableName: dbTable,
  Key: {
    contact_id,
    state,
  },
});

// Get Contact
export const getContact = ({ dbTable, contactId }) => ({
  TableName: dbTable,
  Key: {
    contact_id: contactId,
  },
});

// Update Contact
export const updateContact = ({
  dbTable,
  contactId,
  state,
  priority,
  action,
  agentId,
  transferId,
  cases: { pdas, worksites, ids },
}) => ({
  TableName: dbTable,
  ...Expressions([
    { name: 'state', value: state },
    { key: 'p', name: 'priority', value: String(priority || 1) },
    { key: 't', name: 'entered_timestamp', value: new Date().toISOString() },
    { key: 'a', name: 'action', value: action },
    { key: 'i', name: 'agent_id', value: agentId },
    { key: 'd', name: 'pdas', value: pdas },
    { key: 'w', name: 'worksites', value: worksites },
    { key: 'z', name: 'ids', value: ids },
    { key: 'x', name: 'transfer_id', value: transferId },
    // expire any contacts that are not updated in 90s
    // implying the call has been abandoned
    { key: 'e', name: 'ttl', value: Math.floor(Date.now() / 1000) + 60 * 3 },
  ]),
  Key: {
    contact_id: contactId,
  },
  UpdateExpression: `set #S = :s, #P = :p, #T = :t, #A = :a, #I = :i, #E = :e${
    pdas ? ', #D = :d' : ''
  }${worksites ? ', #W = :w' : ''}${ids ? ', #Z = :z' : ''}${
    transferId ? ', #X = :x' : ''
  }`,
});

// Count Contacts in Queue
export const queryNumByState = ({ dbTable, state }) => ({
  TableName: dbTable,
  ...expiredFilter(Expressions([{ name: 'state', value: state }])),
  KeyConditionExpression: '#S = :S',
  Select: 'COUNT',
  IndexName: 'state-index',
});

// Delete Contact
export const deleteContact = ({ dbTable, contactId }) => ({
  TableName: dbTable,
  Key: {
    contact_id: contactId,
  },
});
