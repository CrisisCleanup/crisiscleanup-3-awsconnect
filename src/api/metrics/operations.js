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
export const incrementMetric = ({ name, amount } = {}) => ({
  ...MetricExpressions(amount),
  UpdateExpression: 'set #V = #V + :v',
  Key: {
    type: 'realtime',
    name,
  },
});

export const decrementValue = ({ name, amount } = {}) => ({
  ...MetricExpressions(amount),
  UpdateExpression: 'set #V = #V - :v',
  Key: {
    type: 'realtime',
    name,
  },
});

export const setValue = ({ name, value }) => ({
  ...MetricExpressions(value),
  UpdateExpression: 'set #V = :v',
  Key: {
    type: 'realtime',
    name,
  },
});
