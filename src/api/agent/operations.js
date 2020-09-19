/**
 * operations.js
 * Agent Module
 */

import { Expressions } from '../../utils/dynamo';

// Scan agents by state
export const scanAgentsByState = ({ dbTable, state, selector = 'COUNT' }) => ({
  TableName: dbTable,
  Select: selector,
  ...Expressions([{ key: 's', name: 'state', value: state }]),
  FilterExpression: 'begins_with(#S, :s)',
});

// Query agents by state
export const queryAgentsByState = ({
  dbTable,
  state,
  selector = 'ALL_ATTRIBUTES',
}) => ({
  TableName: dbTable,
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
  dbTable,
  selector = 'ALL_ATTRIBUTES',
  filter,
} = {}) => ({
  TableName: dbTable,
  ...Expressions([{ key: 'a', name: 'active', value: 'y' }]),
  KeyConditionExpression: '#A = :a',
  FilterExpression: filter,
  Select: selector,
  IndexName: 'state-index',
});

// Scan w/ filter
export const scanFilter = ({
  dbTable,
  selector = 'ALL_ATTRIBUTES',
  filter,
}) => ({
  TableName: dbTable,
  FilterExpression: filter,
  Select: selector,
  ConsistentRead: true,
});

// Update agent connection id
export const updateConnectionId = ({ dbTable, agentId, connectionId }) => ({
  TableName: dbTable,
  ...Expressions([{ key: 'c', name: 'connection_id', value: connectionId }]),
  Key: {
    agent_id: agentId,
  },
  UpdateExpression: `set #C = :c`,
  ConditionExpression: 'attribute_exists(agent_id)'
});

// Update agent state if it doesnt have contact id
export const updateStateByHeartbeat = ({ dbTable, agentId, agentState }) => ({
  TableName: dbTable,
  ...Expressions([{ key: 'as', name: 'state', value: agentState }]),
  Key: {
    agent_id: agentId,
  },
  UpdateExpression: 'set #AS = :as',
  ConditionExpression: 'attribute_not_exists(current_contact_id)',
});
