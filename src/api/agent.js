/* eslint-disable camelcase */
/**
 * agent.js
 * Agent Api Module
 */

import { Dynamo } from '../utils';
import { Event, EVENT_OBJECTS } from './events';

const TABLE = Dynamo.TABLES.AGENTS;

export const AGENT_STATES = Object.freeze({
  PENDING_CALL: 'PendingBusy',
  AGENT_CALLING: 'CallingCustomer',
  AGENT_PENDING: 'pending',
  ROUTABLE: 'routable',
  NOT_ROUTABLE: 'not_routable',
  BUSY: 'Busy',
  ON_CALL: 'Busy',
  OFFLINE: 'offline',
  DISCONNECTED: 'ended',
  PAUSED: 'AfterCallWork',
});

export const AGENT_STATE_TYPES = [
  AGENT_STATES.ROUTABLE,
  AGENT_STATES.NOT_ROUTABLE,
];

const ROUTABLE_STATES = [AGENT_STATES.ROUTABLE];

const NOT_ROUTABLE_STATES = [
  AGENT_STATES.ON_CALL,
  AGENT_STATES.NOT_ROUTABLE,
  AGENT_STATES.OFFLINE,
  AGENT_STATES.AGENT_PENDING,
  AGENT_STATES.PAUSED,
  AGENT_STATES.PENDING_CALL,
  AGENT_STATES.AGENT_CALLING,
];

const INROUTE_STATES = [AGENT_STATES.PENDING_CALL, AGENT_STATES.AGENT_CALLING];

export const AGENT_STATE_GROUPS = Object.freeze({
  [AGENT_STATES.ROUTABLE]: ROUTABLE_STATES,
  [AGENT_STATES.NOT_ROUTABLE]: NOT_ROUTABLE_STATES,
});

export const isRoutable = (state) =>
  ROUTABLE_STATES.includes(state.split('#')[2] || state);
export const isInRoute = (state) =>
  INROUTE_STATES.includes(state.split('#')[2] || state);

export const getStateDef = (state) => {
  if (!state || state === null || typeof state !== 'string') {
    console.log(`state ${state} is not a supported type!`);
    return getStateDef(AGENT_STATES.OFFLINE);
  }
  if (state.includes('#')) {
    console.log(`state [${state}] already contains type, returning`);
    return state.split('#');
  }
  const stateType = Object.keys(AGENT_STATE_GROUPS).filter((key) =>
    AGENT_STATE_GROUPS[key].includes(state) ? key : false,
  );
  if (stateType.length) {
    console.log(`found state type: ${stateType} for state: ${state}`);
    const isOnline = state === 'offline' ? 'offline' : 'online';
    return [isOnline, stateType[0], state];
  }
  console.log(`Unknown state type for state: ${state}`);
  return ['offline', '', state];
};

export const AGENT_ATTRS = Object.freeze({
  STATE: 'state',
  ENTERED: 'entered_timestamp',
  LAST_CONTACT: 'last_contact_id',
  CURRENT_CONTACT: 'current_contact_id',
  CONNECTION: 'connection_id',
  ACTIVE: 'active',
  STATE_TTL: 'state_ttl',
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
  if (!Item) {
    return Item;
  }
  console.log('fetched item:', Item);
  return Dynamo.normalize(Item);
};

export const setState = async ({ agentId, agentState, ...attrs }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const additionalAttrs = {};
  const fetchedAgent = await get({ agentId });

  const deletedAttrs = [];
  const neededAttrs = [AGENT_ATTRS.CONNECTION];

  const [stateOnline, stateType, subState] = getStateDef(agentState);
  switch (subState) {
    case AGENT_STATES.DISCONNECTED:
    case AGENT_STATES.OFFLINE:
    case AGENT_STATES.ROUTABLE:
      if (fetchedAgent && fetchedAgent.current_contact_id) {
        console.log(
          `releasing contact id ${fetchedAgent.current_contact_id} from ${agentId}`,
        );
        deletedAttrs.push(AGENT_ATTRS.CURRENT_CONTACT);
        deletedAttrs.push(AGENT_ATTRS.STATE_TTL);
        deletedAttrs.push(AGENT_STATES.CASES);
      }
      break;
    case AGENT_STATES.AGENT_CALLING:
    case AGENT_STATES.AGENT_PENDING:
    case AGENT_STATES.PENDING_CALL:
      console.log('agent requires contact attribute! fetching!');
      neededAttrs.push(AGENT_ATTRS.CURRENT_CONTACT);
      neededAttrs.push(AGENT_ATTRS.STATE_TTL);
      neededAttrs.push(AGENT_ATTRS.CASES);
      break;
    default:
      break;
  }

  if (stateOnline) {
    additionalAttrs[AGENT_ATTRS.ACTIVE] = {
      S: 'y',
    };
  } else {
    deletedAttrs.push(AGENT_ATTRS.ACTIVE);
  }

  console.log('originally passed additional attrs:', attrs);
  const reqKeys = Object.keys(attrs);

  const finalKeys = [...new Set([...reqKeys, ...neededAttrs])].filter(
    (k) => !deletedAttrs.includes(k),
  );

  console.log('AGENT FINAL ATTRS:', finalKeys);

  const getDataType = (attr) => {
    const types = {
      number: 'N',
      string: 'S',
    };
    if (Object.keys(types).includes(typeof attr)) {
      return types[typeof attr];
    }
    return 'S';
  };

  finalKeys.forEach((key) => {
    if (attrs[key] && attrs[key] !== null) {
      additionalAttrs[key] = {
        [getDataType(attrs[key])]: attrs[key],
      };
    } else if (fetchedAgent && fetchedAgent[key]) {
      additionalAttrs[key] = {
        [getDataType(attrs[key])]: fetchedAgent[key],
      };
    }
  });
  const finalAgentState = `${stateOnline}#${stateType}#${subState}`;
  const params = {
    ...KeyMap({
      mapName: 'Item',
      agentId,
      agentState: finalAgentState,
      attributes: {
        state: {
          S: finalAgentState,
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
  console.log('set agent state: ', agentId, finalAgentState, results);
  const agent = Dynamo.normalize(results[0]);
  console.log('resulting set agent:', agent);

  return {
    namespace: 'phone',
    action: {
      type: 'action',
      name: 'setAgentState',
      data: {
        state: subState,
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

export class AgentError extends Error {}

export const findNextAgent = async () => {
  const db = Dynamo.DynamoTable(TABLE);
  const params = {
    ExpressionAttributeNames: {
      '#S': 'state',
      '#O': 'active',
    },
    ExpressionAttributeValues: {
      ':t': {
        S: 'online#',
      },
      ':a': {
        S: 'y',
      },
    },
    KeyConditionExpression: '#O = :a AND begins_with (#S, :t)',
    IndexName: 'state-index',
    Select: 'ALL_ATTRIBUTES',
  };
  console.log('querying agents table with:', params);
  const { Items } = await db.query(params).promise();
  const normalizedItems = Items.map((m) => Dynamo.normalize(m));
  console.log('resulting items:', normalizedItems);
  if (!normalizedItems.length) {
    throw new AgentError('No agents are available!');
  }

  const routables = normalizedItems.filter((a) => isRoutable(a.state));
  console.log('filtered routables:');
  if (!routables.length) {
    console.log('active agents found, but none are currently routable!');
    return false;
  }

  // find the agent who's been routable the longest
  const agent = normalizedItems.reduce((pre, cur) => {
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
      state: getStateDef(agentState)[2] || getStateDef(agent.state)[2],
    },
  };
};
