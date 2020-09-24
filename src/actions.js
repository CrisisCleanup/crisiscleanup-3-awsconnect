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
  client,
  contactData,
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
  let stateExpire = null;

  const statePayload = {
    agentId,
    agentState: fullState,
    current_contact_id: initContactId || currentContactId,
    connection_id: connectionId,
    locale,
  };
  const isEnteringContact =
    agent &&
    currentContactId &&
    !agent.current_contact_id &&
    [Agent.AGENT_STATES.AGENT_CALLING].includes(contactState);

  const isExpired =
    agent &&
    agent.current_contact_id &&
    agent.state_ttl &&
    [Agent.AGENT_STATES.AGENT_CALLING].includes(contactState) &&
    Math.floor(Date.now() / 1000) > Number(agent.state_ttl);

  if (isEnteringContact) {
    // set state ttl for outbound calls
    stateExpire = Math.floor(Date.now() / 1000) + 70 * 3; // expire state if it doesn't change in 70s
    statePayload.state_ttl = String(stateExpire);
    statePayload.current_contact_id = currentContactId;
  }
  if (isExpired) {
    // agent dropped contact, go offline
    statePayload.agentState = 'offline#not_routable#not_routable';
    statePayload.current_contact_id = null;
  }
  const resp = await Agent.setState(statePayload);
  console.log('agent state response', resp);
  if (client === 'ws' && isExpired) {
    const agentClient = await new Client.Client({ connectionId }).load();
    await agentClient.send(
      RESP.UPDATE_CONTACT({
        state: Contact.CONTACT_STATES.ROUTED,
        action: Contact.CONTACT_ACTIONS.MISSED,
      }),
    );
    await agentClient.send(
      RESP.UPDATE_AGENT({
        state: Agent.AGENT_STATES.OFFLINE,
        routeState: Agent.AGENT_STATES.NOT_ROUTABLE,
      }),
    );
  }
  if (client !== 'ws') {
    console.log('sending data to socket client!');
    const payload = await Agent.createStateWSPayload({ agentId, agentState });
    console.log('[socket] (SERVER -> CLIENT)', payload);
    const agentClient = await new Client.Client({
      connectionId: payload.meta.connectionId,
    }).load();
    try {
      const [stateOnline, routeState, contactState] = Agent.getStateDef(
        agentState,
      );
      await agentClient.send({
        ...RESP.UPDATE_AGENT({
          state: stateOnline,
          routeState,
        }),
      });
      const agent = await Agent.get({ agentId });

      if (agent.current_contact_id) {
        let contactId = agent.current_contact_id;
        const contact = await new Contact.Contact({
          contactId,
        }).load();
        await agentClient.send(
          RESP.UPDATE_CONTACT({
            contactId: contact.contactId,
            state: contact.routeState,
            action: contact.action,
            attributes: { ...contactData.Attributes, ...contact.cases },
          }),
        );
      }
    } catch (e) {
      console.error(e);
      console.log('failed to update agent state!');
    }
  }
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
  callAni,
  currentContactId,
  targetAgentId,
  targetInboundId,
  targetAgentState,
  triggerPrompt,
  contactData,
}) => {
  console.log('trigger prompt timer:', triggerPrompt);
  let newTriggerValue = String(Number(triggerPrompt) + 25);
  if (newTriggerValue >= 500) {
    newTriggerValue = 0;
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
  const contact = await new Contact.Contact({
    contactId: initContactId,
    priority: 1,
    contactLocale: contactData.Attributes.USER_LANGUAGE,
  }).load();
  if (inbound) {
    contact.priority = inbound.priority || contact.priority;
  }
  // await contact.setState(Contact.CONTACT_STATES.QUEUED);
  await contact.setState();
  const inboundEvent = new Events.Event({ itemId: inboundId }).object(
    Events.EVENT_OBJECTS.INBOUND,
  );
  if (targetAgentId) {
    const targAgent = await Agent.getTargetAgent({
      currentContactId: initContactId,
    });
    const agentEvent = new Events.Event().object(Events.EVENT_OBJECTS.AGENT);
    if (!targAgent) {
      return {
        data: {
          targetAgentId: '',
          targetAgentState: 'PENDING',
          targetInboundId: inboundId,
          triggerPrompt: newTriggerValue,
          ...contact.cases,
        },
      };
    }

    contact.agentId = targAgent.agent_id;
    const newState = Agent.isInRoute(targAgent.state) ? 'READY' : 'PENDING';
    const isOnline = Agent.isOnline(targAgent.state);
    const hasExpired =
      Math.floor(Date.now() / 1000) > Number(targAgent.state_ttl);
    if ((newState === 'PENDING' && hasExpired) || !isOnline) {
      // release the contact id
      console.log(
        'agent state ttl has expired or agent is offline! setting offline and relasing contact...',
      );
      await Agent.setState({
        agentId: targAgent.agent_id,
        agentState: Agent.AGENT_STATES.OFFLINE,
      });
      await inboundEvent.join(agentEvent).save({
        agent_id: targAgent.agent_id,
        contact_id: initContactId,
        ivr_action: 'reject',
      });
      await inboundEventCallback(Inbound.InboundEvent.REJECT);
      await denyCallback({
        inboundNumber,
        contactId: initContactId,
        contactData,
        agentId: targAgent.agent_id,
        client: 'ws',
      });
    } else {
      await contact.setState(Contact.CONTACT_STATES.ROUTED);
      await inboundEvent.update().save({
        ivr_action: Contact.CONTACT_STATES.ROUTED,
      });
      await inboundEventCallback(Inbound.InboundEvent.ROUTED);
      // const attributes = { ...contact.cases, callerID: inboundNumber };
      const payload = {
        meta: {
          endpoint: process.env.WS_CALLBACK_URL,
          connectionId: targAgent.connection_id,
        },
        ...RESP.UPDATE_CONTACT({
          contactId: targAgent.current_contact_id,
          agentId: targAgent.agent_id,
          state: contact.routeState,
          action: contact.action,
          attributes: { ...contactData.Attributes, ...contact.cases },
        }),
      };
      try {
        await WS.send(payload);
      } catch (e) {
        // handle agent disconnects
        if (e.statusCode === 410) {
          await Agent.setState({
            agentId: targAgent.agent_id,
            agentState: Agent.AGENT_STATES.OFFLINE,
          });
          await inboundEvent.join(agentEvent).save({
            agent_id: targAgent.agent_id,
            contact_id: initContactId,
            ivr_action: 'abandon',
          });
          await inboundEventCallback(Inbound.InboundEvent.ABANDON);
          console.log('Lost connection to agent! Setting offline...');
          return {
            data: {
              targetAgentId: '',
              targetAgentState: '',
              triggerPrompt: newTriggerValue,
              targetInboundId: inboundId,
              ...contact.cases,
            },
          };
        }
      }
    }
    return {
      data: {
        targetAgentId: targAgent.agent_id,
        targetAgentState: newState,
        triggerPrompt: newTriggerValue,
        targetInboundId: inboundId,
        ...contact.cases,
      },
    };
  }
  let agent;
  try {
    agent = await Agent.findNextAgent(contact.locale);
  } catch (e) {
    if (e instanceof Agent.AgentError) {
      await inboundEventCallback(Inbound.InboundEvent.NO_AVAILABLE);
      return {
        data: {
          targetAgentState: 'NONE',
          triggerPrompt: newTriggerValue,
          targetInboundId: inboundId,
          ...contact.cases,
        },
      };
    }
    throw e;
  }

  // agents are online, but not routable
  if (!agent) {
    return {
      data: {
        targetAgentId: '',
        targetAgentState: 'PENDING',
        targetInboundId: inboundId,
        triggerPrompt: newTriggerValue,
        ...contact.cases,
      },
    };
  }

  // found a routable and ready agent
  const stateExpire = Math.floor(Date.now() / 1000) + 70 * 3; // expire state if it doesn't change in 70s
  await Agent.setState({
    agentId: agent.agent_id,
    agentState: agent.state,
    current_contact_id: initContactId,
    state_ttl: String(stateExpire),
  });
  if (Agent.isRoutable(agent.state) && Agent.isOnline(agent.state)) {
    await inboundEventCallback(Inbound.InboundEvent.ROUTED);
    console.log('agent is routable! calling now...');
    const agentClient = await new Client.Client({
      connectionId: agent.connection_id,
    }).load();
    await agentClient.send(
      RESP.UPDATE_CONTACT({
        contactId: contact.contactId,
        state: contact.routeState,
        action: contact.action,
        attributes: { ...contactData.Attributes, ...contact.cases },
      }),
    );
    await Inbound.prompt({ inboundId: inboundId, agentId: agent.agent_id });
  }
  return {
    data: {
      targetAgentId: agent.agent_id,
      targetAgentState: 'PENDING',
      triggerPrompt: newTriggerValue,
      targetInboundId: inboundId,
      ...contact.cases,
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
};
