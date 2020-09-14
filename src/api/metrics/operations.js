/**
 * operations.js
 * Metrics Module
 */

import { Expressions } from '../../utils/dynamo';

const MetricExpressions = (amount) =>
  Expressions([
    // { key: 't', name: 'type', value: 'realtime' },
    { key: 'v', name: 'value', value: amount },
  ]);

// Update Realtime Metrics
export const incrementMetric = ({ dbTable, name, amount } = {}) => ({
  TableName: dbTable,
  ...MetricExpressions(amount),
  UpdateExpression: 'set #V = #V + :v',
  Key: {
    type: 'realtime',
    name,
  },
});

export const decrementValue = ({ dbTable, name, amount } = {}) => ({
  TableName: dbTable,
  ...MetricExpressions(amount),
  UpdateExpression: 'set #V = #V - :v',
  Key: {
    type: 'realtime',
    name,
  },
});

export const setValue = ({ dbTable, name, value }) => ({
  TableName: dbTable,
  ...MetricExpressions(value),
  UpdateExpression: 'set #V = :v',
  Key: {
    type: 'realtime',
    name,
  },
});

export const getRealtime = ({ dbTable }) => ({
  TableName: dbTable,
  ...Expressions([
    { key: 't', name: 'type', value: 'realtime' },
    { key: 'n', name: 'name', value: 'AGENTS' },
  ]),
  KeyConditionExpression: '#T = :t and begins_with(#N, :n)',
  Select: 'ALL_ATTRIBUTES',
});
