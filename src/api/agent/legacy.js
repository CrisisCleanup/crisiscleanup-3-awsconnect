/* eslint-disable camelcase */
/**
 * agent.js
 * Agent Api Module
 */

import { Dynamo } from '../../utils';
import AgentV2 from './agent';
import RESP from '../../ws/response';
import { LANGUAGE } from '../helpers';

export const Agent = AgentV2;

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
  ROUTABLE_STATES.includes(state.split('#')[1] || state);
export const isInRoute = (state) =>
  INROUTE_STATES.includes(state.split('#')[2] || state);
export const isOnline = (state) => state.split('#')[0] === 'online';

export const getStateDef = (state) => {
  if (!state || typeof state !== 'string') {
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
  CURRENT_CONTACT: 'current_contact_id',
  CONNECTION: 'connection_id',
  ACTIVE: 'active',
  STATE_TTL: 'state_ttl',
  LOCALE: 'locale',
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
    TableName: TABLE.name,
    ...KeyMap({
      agentId,
    }),
    ProjectionExpression: projExp.join(','),
    ConsistentRead: true,
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
  if (!Item[AGENT_ATTRS.LOCALE]) {
    Item[AGENT_ATTRS.LOCALE] = {
      S: LANGUAGE.en_US,
    };
  }
  console.log('fetched item:', Item);
  return Dynamo.normalize(Item);
};

export const setState = async ({ agentId, agentState, ...attrs }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const additionalAttrs = {};
  let fetchedAgent;
  try {
    fetchedAgent = await get({ agentId });
  } catch (e) {
    console.log('failed to fetch agent, could be new?');
    console.log(e);
  }

  const deletedAttrs = [];
  let neededAttrs = [AGENT_ATTRS.CONNECTION, AGENT_ATTRS.LOCALE];

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
      }
      break;
    case AGENT_STATES.AGENT_CALLING:
    case AGENT_STATES.AGENT_PENDING:
    case AGENT_STATES.PENDING_CALL:
    case AGENT_STATES.BUSY:
      console.log('agent requires contact attribute! fetching!');
      neededAttrs.push(AGENT_ATTRS.CURRENT_CONTACT);
      neededAttrs.push(AGENT_ATTRS.STATE_TTL);
      break;
    case AGENT_STATES.PAUSED:
      console.log('agent in ACW, remove current contact...');
      neededAttrs = neededAttrs.filter(
        (a) => a !== AGENT_ATTRS.CURRENT_CONTACT,
      );
      deletedAttrs.push(AGENT_ATTRS.CURRENT_CONTACT);
      break;
    default:
      break;
  }

  additionalAttrs[AGENT_ATTRS.LOCALE] = {
    S: LANGUAGE.en_US, // default english
  };
  additionalAttrs[AGENT_ATTRS.ACTIVE] = {
    S: 'y',
  };

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
    TableName: TABLE.name,
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
    ...RESP.UPDATE_AGENT({
      state: stateOnline,
      routeState: stateType,
    }),
  };
};

export const getTargetAgent = async ({ currentContactId }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const params = {
    TableName: TABLE.name,
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

export const findNextAgent = async (language) => {
  const db = Dynamo.DynamoTable({ ...TABLE, bypassCache: true });
  const params = {
    TableName: TABLE.name,
    ExpressionAttributeNames: {
      '#S': 'state',
      '#O': 'active',
      '#L': 'locale',
    },
    ExpressionAttributeValues: {
      ':t': {
        S: 'online#',
      },
      ':a': {
        S: 'y',
      },
      ':e': {
        S: String(language),
      },
    },
    KeyConditionExpression: '#O = :a AND begins_with (#S, :t)',
    FilterExpression: 'contains (#L, :e)',
    IndexName: 'state-index',
    Select: 'ALL_ATTRIBUTES',
  };
  console.log('querying agents table with:', params);
  const { Items } = await db.query(params).promise();
  if (!Items) {
    throw new AgentError('No agents are available!');
  }
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
    namespace: 'phone.streams',
    action: {
      type: 'action',
      name: 'updateAgentClient',
    },
    meta: {
      endpoint: process.env.WS_CALLBACK_URL,
      connectionId: agent.connection_id,
    },
    data: {
      routeState: getStateDef(agentState)[2] || getStateDef(agent.state)[2],
    },
  };
};

export const activeAgents = async () => {
  const db = Dynamo.DynamoClient(TABLE);
  const results = await db
    .query({
      ...Dynamo.Expressions([{ name: 'active', value: 'y' }]),
      KeyConditionExpression: '#S = :s',
      TableName: TABLE.name,
    })
    .promise();
  const { Items } = results;
  return Items;
};
