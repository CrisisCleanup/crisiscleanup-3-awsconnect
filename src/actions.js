/**
 * actions.js
 * Lambda Actions
 */

import { Agent, Inbound, Outbound } from './api';
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
}) => {
  const response = await Outbound.create(
    inboundNumber,
    userLanguage,
    incidentId,
    initContactId,
  );
  Outbound.unlock(inboundNumber);
  if (![200, 201].includes(response.status)) {
    console.error('callback failed to create!', response);
    throw new Error('failed to create callback!');
  }
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
    last_contact_id: initContactId,
    current_contact_id: currentContactId,
    connection_id: connectionId,
  });
  console.log('agent state response', resp);
  if (client !== 'ws') {
    console.log('sending data to socket client!');
    const payload = await Agent.createStateWSPayload({ agentId, agentState });
    console.log('[socket] (SERVER -> CLIENT)', payload);
    await WS.send(payload);
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
  if (client === 'ws') {
    return {
      namespace: 'phone',
      action: {
        type: 'action',
        name: 'setAgentState',
      },
      data: {
        state: agent.state,
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
}) => {
  console.log('trigger prompt timer:', triggerPrompt);
  let newTriggerValue = String(Number(triggerPrompt) + 10);
  if (newTriggerValue >= 40) {
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
  if (targetAgentId) {
    const targAgent = await Agent.getTargetAgent({
      currentContactId: currentContactId || inbound.session_id,
    });
    if (!targAgent || targAgent === null) {
      return {
        data: {
          targetAgentId,
          targetAgentState: 'PENDING',
          triggerPrompt: newTriggerValue,
        },
      };
    }
    const newState = [
      Agent.AGENT_STATES.PENDING_CALL,
      Agent.AGENT_STATES.AGENT_CALLING,
    ].includes(targAgent.state)
      ? 'READY'
      : 'PENDING';
    return {
      data: {
        targetAgentId: targAgent.agent_id,
        targetAgentState: newState,
        triggerPrompt: newTriggerValue,
      },
    };
  }
  const agent = await Agent.findNextAgent();
  if (!agent || agent === null) {
    return {
      data: {
        targetAgentState: 'NONE',
        triggerPrompt: newTriggerValue,
      },
    };
  }
  await Agent.setState({
    agentId: agent.agent_id,
    agentState: agent.state,
    current_contact_id: initContactId,
  });
  await Inbound.prompt({ inboundId: inbound.id, agentId: agent.agent_id });
  return {
    data: {
      targetAgentId: agent.agent_id,
      targetAgentState: 'PENDING',
      triggerPrompt: newTriggerValue,
    },
  };
};

export default {
  CHECK_CASE: checkCases,
  CALLBACK: createCallback,
  DENIED_CALLBACK: denyCallback,
  SET_AGENT_STATE: setAgentState,
  GET_AGENT_STATE: getAgentState,
  FIND_AGENT: findAgent,
};
