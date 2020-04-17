/* eslint-disable camelcase */
/**
 * agent.js
 * Agent Api Module
 */

import { Dynamo } from '../utils';

const TABLE = Dynamo.TABLES.AGENTS;

export const AGENT_STATES = Object.freeze({
  PENDING_CALL: 'PendingBusy',
  AGENT_CALLING: 'CallingCustomer',
  AGENT_PENDING: 'pending',
  ROUTABLE: 'routable',
  ON_CALL: 'Busy',
  OFFLINE: 'offline',
  DISCONNECTED: 'ended',
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
  const projExp = attributes || Object.values(AGENT_ATTRS);
  const params = {
    ...KeyMap({
      agentId,
    }),
    ProjectionExpression: projExp.join(','),
  };
  if (projExp.includes('state')) {
    // state is a dynamodb reserved key word
    params.ExpressionAttributeNames = {
      '#A': 'state',
    };
    const filteredProjExp = projExp.filter((i) => i !== 'state');
    filteredProjExp.push('#A');
    params.ProjectionExpression = filteredProjExp.join(',');
  }
  console.log('fetching agent from dynamo:', params);
  const { Item } = await db.getItem(params).promise();
  console.log('fetched item:', Item);
  return Dynamo.normalize(Item);
};

export const setState = async ({ agentId, agentState, ...attrs }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const additionalAttrs = {};
  const fetchedAgent = await get({ agentId });

  const deletedAttrs = [];
  const neededAttrs = [AGENT_ATTRS.CONNECTION];
  switch (agentState) {
    case AGENT_STATES.DISCONNECTED:
    case AGENT_STATES.OFFLINE:
    case AGENT_STATES.ROUTABLE:
      if (fetchedAgent && fetchedAgent.current_contact_id) {
        console.log(
          `releasing contact id ${fetchedAgent.current_contact_id} from ${agentId}`,
        );
        deletedAttrs.push(AGENT_ATTRS.CURRENT_CONTACT);
      }
      break;
    case AGENT_STATES.AGENT_CALLING:
    case AGENT_STATES.AGENT_PENDING:
    case AGENT_STATES.PENDING_CALL:
      console.log('agent requires contact attribute! fetching!');
      neededAttrs.push(AGENT_ATTRS.CURRENT_CONTACT);
      break;
    default:
      break;
  }

  console.log('originally passed additional attrs:', attrs);
  const reqKeys = Object.keys(attrs);

  const finalKeys = [...new Set([...reqKeys, ...neededAttrs])].filter(
    (k) => !deletedAttrs.includes(k),
  );

  console.log('AGENT FINAL ATTRS:', finalKeys);

  finalKeys.forEach((key) => {
    if (attrs[key] && attrs[key] !== null) {
      additionalAttrs[key] = {
        S: attrs[key],
      };
    } else if (fetchedAgent && fetchedAgent[key]) {
      additionalAttrs[key] = {
        S: fetchedAgent[key],
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
  console.log('resulting set agent:', agent);

  return {
    namespace: 'phone',
    action: {
      type: 'action',
      name: 'setAgentState',
      data: {
        state: agentState,
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
