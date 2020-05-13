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

// Update agent connection id
export const updateConnectionId = ({ agentId, connectionId }) => ({
  ...Expressions([{ key: 'c', name: 'connection_id', value: connectionId }]),
  Key: {
    agent_id: agentId,
  },
  UpdateExpression: `set #C = :c`,
});

// Update agent state if it doesnt have contact id
export const updateStateByHeartbeat = ({ agentId, agentState }) => ({
  ...Expressions([{ key: 'as', name: 'state', value: agentState }]),
  Key: {
    agent_id: agentId,
  },
  UpdateExpression: 'set #AS = :as',
  ConditionExpression: 'attribute_not_exists(current_contact_id)',
});
