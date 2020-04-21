/* eslint-disable camelcase */
/**
 * queries.js
 * Contact DB Operations
 */

const AttrExpression = ({ key = 's', name = 'state', value } = {}) => ({
  ExpressionAttributeNames: {
    [`#${key.toUpperCase()}`]: name,
  },
  ExpressionAttributeValues: {
    [`:${key.toLowerCase()}`]: value,
  },
});

const Expressions = (exps) => {
  const finalExp = {
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
  };
  exps.forEach((exp) => {
    const result = AttrExpression(exp);
    finalExp.ExpressionAttributeNames = {
      ...finalExp.ExpressionAttributeNames,
      ...result.ExpressionAttributeNames,
    };
    finalExp.ExpressionAttributeValues = {
      ...finalExp.ExpressionAttributeValues,
      ...result.ExpressionAttributeValues,
    };
  });
  return finalExp;
};

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
export const updateContact = ({ contactId, state, priority }) => ({
  ...Expressions([
    { name: 'state', value: state },
    { key: 'p', name: 'priority', value: priority },
    { key: 't', name: 'entered_timestamp', value: new Date().toISOString() },
    // expire any contacts that are not updated in 3m
    // implying the call has been abandoned
    { key: 'e', name: 'ttl', value: Math.floor(Date.now() / 1000) + 60 * 3 },
  ]),
  Key: {
    contact_id: contactId,
  },
  UpdateExpression: `set #S = :s, #P = :p, #T = :t, #E = :e`,
});
