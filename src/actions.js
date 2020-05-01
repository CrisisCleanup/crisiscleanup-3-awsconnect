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

const checkCases = async ({ inboundNumber }) => {
  const cases = await Outbound.resolveCasesByNumber(inboundNumber);

  // Response must be simple string map
  if (cases.ids.length >= 1) {
    console.log('Case found!');
    return {
      data: {
        ids: cases.ids.join(','),
        pdas: cases.pdas.join(','),
        worksites: cases.worksites.join(','),
      },
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
  await metrics.decrement(Metrics.METRICS.QUEUED);
  await metrics.increment(Metrics.METRICS.CALLBACKS);
  return {
    data: {
      status: 'CREATED',
    },
  };
};

const denyCallback = async ({ inboundNumber, agentId, client }) => {
  console.log('setting agent state to offline...');
  const newState = {
    agentId,
    agentState: Agent.AGENT_STATES.OFFLINE,
  };
  const agentResp = await Agent.setState(newState);
  const payload = await Agent.createStateWSPayload(newState);
  await WS.send(payload);
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
  client,
  initContactId = null,
  currentContactId = null,
  connectionId = null,
}) => {
  console.log(
    'setting agent state: ',
    agentId,
    agentState,
    initContactId,
    currentContactId,
    connectionId,
  );
  const resp = await Agent.setState({
    agentId,
    agentState,
    current_contact_id: initContactId,
    connection_id: connectionId,
  });
  console.log('agent state response', resp);
  await Agent.Agent.refreshMetrics();
  if (client !== 'ws') {
    console.log('sending data to socket client!');
    const payload = await Agent.createStateWSPayload({ agentId, agentState });
    console.log('[socket] (SERVER -> CLIENT)', payload);
    const agentClient = await new Client.Client({ connectionId }).load();
    try {
      await agentClient.send({
        namespace: 'phone',
        action: {
          type: 'action',
          name: 'setAgentState',
        },
        data: {
          state: Agent.getStateDef(agentState)[2],
        },
      });
    } catch (e) {
      console.error(e);
      console.log('failed to update agent state!');
    }
  }
  const callType = currentContactId ? 'INBOUND' : 'OUTBOUND';
  return {
    data: {
      promptCallType: callType,
    },
  };
};

const getAgentState = async ({ agentId, client }) => {
  console.log('fetching agent state for agent:', agentId);
  const agent = await Agent.get({ agentId });
  console.log('got agent:', agent);
  if (client === 'ws' && agent) {
    const [stateOnline, stateType, subState] = Agent.getStateDef(agent.state);
    return {
      namespace: 'phone',
      action: {
        type: 'action',
        name: 'setAgentState',
      },
      data: {
        state: subState,
      },
    };
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
  triggerPrompt,
  worksites,
  ids,
  pdas,
  // dnisStats
}) => {
  console.log('trigger prompt timer:', triggerPrompt);
  let newTriggerValue = String(Number(triggerPrompt) + 10);
  if (newTriggerValue >= 130) {
    newTriggerValue = 0;
  }
  console.log('finding next agent to serve contact too...');
  const inbound = await Inbound.create({
    initContactId,
    number: inboundNumber,
    incidentId,
    language: userLanguage,
    ani: callAni,
  });
  console.log('created inbound: ', inbound);
  const contact = await new Contact.Contact({
    contactId: initContactId,
    priority: inbound.priority,
  }).load();
  await contact.setState(Contact.CONTACT_STATES.QUEUED);
  const inboundEvent = new Events.Event({ itemId: inbound.id }).object(
    Events.EVENT_OBJECTS.INBOUND,
  );
  if (targetAgentId) {
    const targAgent = await Agent.getTargetAgent({
      currentContactId: currentContactId || inbound.session_id,
    });
    const agentEvent = new Events.Event().object(Events.EVENT_OBJECTS.AGENT);
    if (!targAgent || targAgent === null) {
      return {
        data: {
          targetAgentId: '',
          targetAgentState: 'PENDING',
          triggerPrompt: newTriggerValue,
        },
      };
    }

    contact.agentId = targAgent.agent_id;
    const newState = Agent.isInRoute(targAgent.state) ? 'READY' : 'PENDING';
    const hasExpired = Date.now() > Number(targAgent.state_ttl);
    if (newState === 'PENDING' && hasExpired) {
      // release the contact id
      console.log(
        'agent state ttl has expired! setting offline and relasing contact...',
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
    } else {
      await contact.setState(Contact.CONTACT_STATES.ROUTED);
      await inboundEvent.update().save({
        ivr_action: Contact.CONTACT_STATES.ROUTED,
      });
      const attributes = { worksites, pdas, ids, callerID: inboundNumber };
      await inboundEvent.join(agentEvent).save({
        agent_id: targAgent.agent_id,
        contact_id: initContactId,
        ivr_action: 'receive',
      });
      const payload = {
        namespace: 'phone',
        action: {
          type: 'action',
          name: 'setContactState',
        },
        meta: {
          endpoint: process.env.WS_CALLBACK_URL,
          connectionId: targAgent.connection_id,
        },
        data: {
          state: {
            id: targAgent.current_contact_id,
            attributes,
          },
        },
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
          console.log('Lost connection to agent! Setting offline...');
          return {
            data: {
              targetAgentId: '',
              targetAgentState: '',
              triggerPrompt: newTriggerValue,
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
      },
    };
  }
  let agent;
  try {
    agent = await Agent.findNextAgent();
  } catch (e) {
    if (e instanceof Agent.AgentError) {
      return {
        data: {
          targetAgentState: 'NONE',
          triggerPrompt: newTriggerValue,
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
        triggerPrompt: newTriggerValue,
      },
    };
  }

  // found a routable and ready agent
  const stateExpire = Date.now() + 40 * 1000; // expire state if it doesn't change in 40s
  await Agent.setState({
    agentId: agent.agent_id,
    agentState: agent.state,
    current_contact_id: initContactId,
    state_ttl: String(stateExpire),
  });
  if (Agent.isRoutable(agent.state)) {
    console.log('agent is routable! calling now...');
    await Inbound.prompt({ inboundId: inbound.id, agentId: agent.agent_id });
  }
  return {
    data: {
      targetAgentId: agent.agent_id,
      targetAgentState: 'PENDING',
      triggerPrompt: newTriggerValue,
    },
  };
};

export const updateContact = async ({ contactId, action } = {}) => {
  const contact = await new Contact.Contact({ contactId }).load();
  try {
    console.log('[updateContact] trying to update contact action to:', action);
    contact.action = action || contact.action;
    await contact.setState(contact.State);
  } catch (e) {
    console.error(e);
  }
  return {};
};

export const getContacts = async ({}) => {
  const contacts = await new Contact.Contact().getAll();
  return {
    namespace: 'phone',
    action: {
      type: 'action',
      name: 'setContactMetrics',
    },
    data: {
      contacts,
    },
  };
};

export const getAgents = async ({ connectionId, userId, type }) => {
  console.log('fetching all agents!');
  const agents = await Agent.Agent.getAll();
  const client = await new Client.Client({ connectionId, userId, type }).load();
  const payload = {
    namespace: 'phone',
    action: {
      type: 'action',
      name: 'getAgentMetrics',
    },
    data: {
      agents,
    },
  };
  await client.send(payload);
  console.log('send client payload: ', payload);
  return {};
};

export const clientHeartbeat = async ({ connectionId, userId, type }) => {
  console.log('got client heartbeat!');
  const client = await new Client.Client({
    connectionId,
    userId,
    type,
  }).load();
  await client.heartbeat();
  await Agent.Agent.refreshMetrics();
  return {};
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
