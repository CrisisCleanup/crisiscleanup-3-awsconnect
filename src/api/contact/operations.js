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

// Update Contact
export const updateContact = ({ contactId, state, priority }) => ({
  ...Expressions([
    { name: 'state', value: state },
    { key: 'p', name: 'priority', value: priority },
    { key: 't', name: 'entered_timestamp', value: new Date().toISOString() },
  ]),
  Key: {
    contact_id: contactId,
  },
  UpdateExpression: `set #S = :s and set #P = :p and set #T = :t`,
});
