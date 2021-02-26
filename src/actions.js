/**
 * actions.js
 * Lambda Actions
 */

import {
  Agent,
  Client,
  Contact,
  Events,
  Inbound,
  Metrics,
  Outbound,
} from './api';
import WS from './ws';
import RESP from './ws/response';
import { CONTACT_ACTIONS, CONTACT_STATES } from './api/contact/contact';

const checkCases = async ({
  inboundNumber,
  incidentId,
  worksites,
  pdas,
  ids,
  initContactId,
  contactData,
}) => {
  const contact = await new Contact.Contact({
    contactId: initContactId,
  }).load();
  // Don't re-resolve if we already did
  if (contactData.WORKSITES || contactData.PDAS) {
    console.log('Already resolved cases!');
    contact.cases = {
      ids: contactData.OUTBOUND_IDS,
      pdas: contactData.PDAS,
      worksites: contactData.WORKSITES,
    };
    await contact.setState(Contact.CONTACT_STATES.QUEUED);
    return {
      data: contact.cases,
    };
  }

  if (contact.cases.worksites || contact.cases.ids) {
    console.log('falling back to contacts cases!');
    return {
      data: contact.cases,
    };
  }

  const cases = await Outbound.resolveCasesByNumber(
    initContactId,
    inboundNumber,
    incidentId,
  );

  // Response must be simple string map
  if (cases.ids.length >= 1 || cases.worksites.length) {
    console.log('Case found!');
    contact.cases = {
      ids: cases.ids.join(','),
      pdas: cases.pdas.join(','),
      worksites: cases.worksites.join(','),
    };
    await contact.setState(Contact.CONTACT_STATES.QUEUED);
    return {
      data: contact.cases,
    };
  }
  // Catch all, 'no ID'
  console.log('No cases found!');
  throw new Error('Number does not have a pda or worksite associated!');
};

const createCallback = async ({
  inboundNumber,
  userLanguage,
  incidentId,
  initContactId,
  callAni,
}) => {
  const response = await Outbound.create(
    inboundNumber,
    userLanguage,
    incidentId,
    initContactId,
    callAni,
  );
  await Outbound.unlock(inboundNumber);
  if (![200, 201].includes(response.status)) {
    console.error('callback failed to create!', response);
    throw new Error('failed to create callback!');
  }
  const contact = await new Contact.Contact({
    contactId: initContactId,
  }).load();
  await contact.delete();
  const metrics = new Metrics.Metrics();
  await metrics.decrement(Metrics.METRICS.QUEUED, 1, contact.locale);
  await metrics.increment(Metrics.METRICS.CALLBACKS, 1, contact.locale);
  return {
    data: {
      status: 'CREATED',
    },
  };
};

const denyCallback = async ({
  inboundNumber,
  agentId,
  client,
  contactData,
  contactId = null,
}) => {
  console.log('setting agent state to offline...');
  const newState = {
    agentId,
    agentState: 'offline#not_routable#not_routable',
  };
  const agent = Agent.getTargetAgent({
    currentContactId: contactId || contactData.Attributes.CONTACT_ID,
  });

  const contact = await new Contact.Contact({
    contactId: agent.current_contact_id,
  }).load();

  const agentResp = await Agent.setState(newState);
  const payload = await Agent.createStateWSPayload(newState);

  try {
    const agentClient = await new Client.Client({
      connectionId: payload.meta.connectionId,
    }).load();
    await agentClient.send({
      ...RESP.UPDATE_CONTACT({
        ...(contact ? { contactId: contact.contactId } : {}),
        action: CONTACT_ACTIONS.MISSED,
        state: CONTACT_STATES.ROUTED,
      }),
    });
  } catch (e) {
    console.error(e);
    console.log('failed to update client state, are they still online?');
  }

  console.log('unlocking callback for:', inboundNumber);
  const resp = await Outbound.unlock(inboundNumber);
  if (!resp.status === 200) {
    console.error(resp);
    throw new Error('outbound failed to unlock!');
  }
  return {
    data: {
      status: 'UNLOCKED',
    },
  };
};

const setAgentState = async ({
  agentId,
  agentState,
  state,
  routeState,
  contactState,
  locale,
  initContactId = null,
  currentContactId = null,
  connectionId = null,
} = {}) => {
  console.log(
    'setting agent state: ',
    agentId,
    state,
    routeState,
    contactState,
    initContactId,
    currentContactId,
    connectionId,
  );
  let fullState = agentState;
  const agent = await Agent.get({ agentId });
  if (!fullState) {
    let _fullState = Agent.getStateDef(
      [state, routeState, contactState].join('#'),
    );

    if (!contactState) {
      if (agent) {
        // incoming data did not provide a contact state,
        // but an existing agent does exist in the database
        const curContactState = Agent.getStateDef(agent.state)[2];
        _fullState = [_fullState[0], _fullState[1], curContactState];
      } else {
        // incoming data did not provide a contact state,
        // and the agent is new and/or does not exist in db.
        const curContactState = Agent.getStateDef(_fullState[1])[2];
        _fullState = [_fullState[0], _fullState[1], curContactState];
      }
    }
    fullState = _fullState.join('#');
  }
  const statePayload = {
    agentId,
    agentState: fullState,
    current_contact_id: initContactId || currentContactId,
    connection_id: connectionId,
    locale,
  };
  const resp = await Agent.setState(statePayload);
  console.log('agent state response', resp);
  return {
    data: {
      promptCallType: currentContactId ? 'INBOUND' : 'OUTBOUND',
    },
  };
};

const getAgentState = async ({ agentId, client }) => {
  console.log('fetching agent state for agent:', agentId);
  const agent = await Agent.get({ agentId });
  console.log('got agent:', agent);
  if (client === 'ws' && agent) {
    const [stateOnline, stateType, subState] = Agent.getStateDef(agent.state);
    return RESP.UPDATE_AGENT({
      state: stateOnline,
      routeState: stateType,
    });
  }
};

const findAgent = async ({
  initContactId,
  inboundNumber,
  incidentId,
  userLanguage,
  targetAgentId,
  targetInboundId,
  targetAgentState,
  triggerPrompt,
  contactData,
  callAni,
} = {}) => {
  console.log('trigger prompt timer:', triggerPrompt);
  let newTriggerValue = String(Number(triggerPrompt) + 25);
  if (newTriggerValue >= 500 || !newTriggerValue) {
    newTriggerValue = 0;
  }

  const contact = await new Contact.Contact({
    contactId: initContactId,
    priority: 1,
    contactLocale: contactData.Attributes.USER_LANGUAGE,
  }).load();
  if (!targetInboundId) {
    await contact.setState();
  }

  console.log('finding next agent to serve contact too...');
  let inboundId = targetInboundId;
  const [inbound, inboundEventCallback] = await Inbound.create({
    initContactId,
    number: inboundNumber,
    incidentId,
    language: userLanguage,
    ani: callAni,
    action: targetAgentState,
  });
  console.log('created inbound: ', inbound);
  if (!targetInboundId) {
    inboundId = inbound.id;
  }

  if (targetAgentState === 'READY' || targetAgentId !== '') {
    console.log('agent is routable! calling now...');
  }
  return {
    data: {
      triggerPrompt: newTriggerValue,
      targetInboundId: inboundId,
    },
  };
};

export const updateContact = async ({ contactId, action, agentId } = {}) => {
  const contact = await new Contact.Contact({
    contactId,
    action,
    agentId,
  }).load();
  try {
    console.log('[updateContact] trying to update contact action to:', action);
    contact.action = action || contact.action;
    await contact.setState();
  } catch (e) {
    console.log('something went wrong during contact update!');
    console.log(e);
  }
  const contacts = await new Contact.Contact().getAll();
  return {
    ...RESP.UPDATE_CONTACT_METRICS({
      contacts,
    }),
  };
};

export const getContacts = async ({}) => {
  const contacts = await new Contact.Contact().getAll();
  return {
    ...RESP.UPDATE_CONTACT_METRICS({
      contacts,
    }),
  };
};

export const getAgents = async ({ connectionId, userId, type }) => {
  console.log('fetching all agents!');
  const agents = await Agent.Agent.getAll();
  const client = await new Client.Client({ connectionId, userId, type }).load();
  const payload = {
    ...RESP.UPDATE_AGENT_METRICS({ agents }),
  };
  await client.send(payload);
  console.log('send client payload: ', payload);
  return payload;
};

export const clientHeartbeat = async ({
  connectionId,
  userId,
  agentId,
  type,
}) => {
  console.log('pong! got client heartbeat!');
  const client = await new Client.Client({
    connectionId,
    userId,
    type,
  }).load();
  await client.heartbeat(agentId);
  return RESP.PONG();
};

export const findTransferAni = async ({ contactData }) => {
  const {
    CustomerEndpoint: { Address },
  } = contactData;
  console.log('requesting transfer ani for:', Address);
  const resp = await Inbound.requestTransferAni({ callerDnis: Address });
  console.log('got response!', resp);
  return {
    data: {
      transferAni: '+' + String(resp.phone_number),
    },
  };
};

export const findTransferContact = async ({ contactData: { ContactId, CustomerEndpoint } }) => {
  const resp = await Outbound.resolveContactTransfer({ contactId: ContactId, verifyAni: CustomerEndpoint.Address });
  return {
    data: {
      TRANSFER_FROM: String(resp.transfer_id),
    },
  };
};

export const findVerifyAni = async ({
  contactData: { ContactId, Attributes },
}) => {
  await Outbound.findOutboundVerifyAni({
    contactId: ContactId,
    taskId: Attributes.OUTBOUND_VERIFY_ANI_TASK || null,
  });
  return {
    data: {},
  };
};

export default {
  CHECK_CASE: checkCases,
  CALLBACK: createCallback,
  DENIED_CALLBACK: denyCallback,
  SET_AGENT_STATE: setAgentState,
  GET_AGENT_STATE: getAgentState,
  FIND_AGENT: findAgent,
  UPDATE_CONTACT: updateContact,
  GET_CONTACTS: getContacts,
  CLIENT_HEARTBEAT: clientHeartbeat,
  GET_AGENTS: getAgents,
  TRANSFER_ANI: findTransferAni,
  RECV_TRANSFER_CONTACT: findTransferContact,
  DETERMINE_VERIFY_ANI: findVerifyAni,
};
