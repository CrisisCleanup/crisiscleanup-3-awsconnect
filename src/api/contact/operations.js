/* eslint-disable camelcase */
/**
 * queries.js
 * Contact DB Operations
 */

import { Expressions } from '../../utils/dynamo';

// Create Contact
export const createContact = ({ contact_id, state }) => ({
  Key: {
    contact_id,
    state,
  },
});

// Get Contact
export const getContact = ({ contactId }) => ({
  Key: {
    contact_id: contactId,
  },
});

// Update Contact
export const updateContact = ({
  contactId,
  state,
  priority,
  action,
  agentId,
}) => ({
  ...Expressions([
    { name: 'state', value: state },
    { key: 'p', name: 'priority', value: priority },
    { key: 't', name: 'entered_timestamp', value: new Date().toISOString() },
    { key: 'a', name: 'action', value: action },
    { key: 'i', name: 'agent_id', value: agentId },
    // expire any contacts that are not updated in 3m
    // implying the call has been abandoned
    { key: 'e', name: 'ttl', value: Math.floor(Date.now() / 1000) + 60 * 3 },
  ]),
  Key: {
    contact_id: contactId,
  },
  UpdateExpression: `set #S = :s, #P = :p, #T = :t, #A = :a, #I = :i, #E = :e`,
});

// Count Contacts in Queue
export const queryNumByState = ({ state }) => ({
  ...Expressions([{ name: 'state', value: state }]),
  KeyConditionExpression: '#S = :S',
  Select: 'COUNT',
  IndexName: 'state-index',
});

// Delete Contact
export const deleteContact = ({ contactId }) => ({
  Key: {
    contact_id: contactId,
  },
});
