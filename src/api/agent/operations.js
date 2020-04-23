/**
 * operations.js
 * Agent Module
 */

import { Expressions } from '../../utils/dynamo';

// Query agents by state
export const queryAgentsByState = ({ state, selector = 'ALL_ATTRIBUTES' }) => ({
  ...Expressions([
    { key: 'a', name: 'active', value: 'y' },
    { key: 's', name: 'state', value: state },
  ]),
  KeyConditionExpression: '#A = :a and begins_with(#S, :s)',
  Select: selector,
  IndexName: 'state-index',
});

// Query by active w/ filter
export const queryActiveFilter = ({
  selector = 'ALL_ATTRIBUTES',
  filter,
} = {}) => ({
  ...Expressions([{ key: 'a', name: 'active', value: 'y' }]),
  KeyConditionExpression: '#A = :a',
  FilterExpression: filter,
  Select: selector,
  IndexName: 'state-index',
});
