/* eslint-disable camelcase */
/**
 * agent.js
 * Agent Api Module
 */

import { Dynamo } from '../utils';

const TABLE = Dynamo.TABLES.AGENTS;

export const AGENT_STATES = Object.freeze({
  PENDING_CALL: 'pendingCall',
  ROUTABLE: 'routable',
  ON_CALL: 'onCall',
  OFFLINE: 'offline',
});

export const AGENT_ATTRS = Object.freeze({
  STATE: 'state',
  ENTERED: 'entered_timestamp',
  LAST_CONTACT: 'last_contact_id',
  CURRENT_CONTACT: 'current_contact_id',
  CONNECTION: 'connection_id',
});

export const KeyMap = ({
  mapName = 'Key',
  partitionKey = TABLE.hash,
  agentId,
  attributes = {},
}) => ({
  [mapName]: {
    [partitionKey]: {
      S: agentId,
    },
    ...attributes,
  },
});

export const get = async ({ agentId, attributes }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const projExp = attributes || AGENT_ATTRS.values();
  const params = {
    ...KeyMap({
      agentId,
    }),
    ProjectionExpression: projExp.join(','),
  };
  const { Item } = await db.getItem(params).promise();
  return Dynamo.normalize(Item);
};

export const setState = async ({ agentId, agentState, ...attrs }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const additionalAttrs = {};
  Object.keys(attrs).forEach((key) => {
    if (attrs[key] && attrs[key] !== null) {
      additionalAttrs[key] = {
        S: attrs[key],
      };
    }
  });
  const params = {
    ...KeyMap({
      mapName: 'Item',
      agentId,
      agentState,
      attributes: {
        state: {
          S: agentState,
        },
        entered_timestamp: {
          S: new Date().toISOString(),
        },
        ...additionalAttrs,
      },
    }),
  };
  console.log('setting state params:', params);
  const results = await db.putItem(params).promise();
  console.log('set agent state: ', agentId, agentState, results);
  const agent = Dynamo.normalize(results[0]);
  return {
    namespace: 'phone',
    action: {
      type: 'action',
      name: 'setAgentState',
      data: {
        state: agent.state,
      },
    },
  };
};

export const getTargetAgent = async ({ currentContactId }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const params = {
    IndexName: 'contact-index',
    ExpressionAttributeValues: {
      ':contactId': {
        S: currentContactId,
      },
    },
    KeyConditionExpression: 'current_contact_id = :contactId',
    Select: 'ALL_ATTRIBUTES',
  };
  console.log('checking for target agent...', params);
  const { Items } = await db.query(params).promise();
  if (!Items.length) {
    console.log('no current target agent!');
    return null;
  }
  const agent = Dynamo.normalize(Items[0]);
  console.log('got target agent!', agent);
  return agent;
};

export const findNextAgent = async () => {
  const db = Dynamo.DynamoTable(TABLE);
  const params = {
    ExpressionAttributeNames: {
      '#S': 'state',
    },
    ExpressionAttributeValues: {
      ':current': {
        S: 'routable',
      },
    },
    KeyConditionExpression: '#S = :current',
    FilterExpression: 'attribute_not_exists(current_contact_id)',
    IndexName: 'state-index',
    Select: 'ALL_ATTRIBUTES',
  };
  console.log('querying agents table with:', params);
  const { Items } = await db.query(params).promise();
  const normalizedItems = Items.map((m) => Dynamo.normalize(m));
  console.log('resulting items:', normalizedItems);
  if (!normalizedItems.length) {
    return null;
  }
  const routables = normalizedItems.filter(
    (a) => a.state === AGENT_STATES.ROUTABLE,
  );
  // find the agent who's been routable the longest
  const agent = routables.reduce((pre, cur) => {
    return Date.parse(pre.entered_timestamp) > Date.parse(cur.entered_timestamp)
      ? cur
      : pre;
  });
  console.log('found longest standing routable agent:', agent);
  return agent;
};

export const createStateWSPayload = async ({ agentId, agentState }) => {
  const agent = await get({ agentId });
  return {
    namespace: 'phone',
    action: {
      type: 'action',
      name: 'setAgentState',
    },
    meta: {
      endpoint: process.env.WS_CALLBACK_URL,
      connectionId: agent.connection_id,
    },
    data: {
      state: agentState || agent.state,
    },
  };
};
