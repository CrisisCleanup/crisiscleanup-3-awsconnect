/**
 * inbound.js
 * Inbound Api
 */

import axios from 'axios';
import { getLanguageId } from './helpers';

export const InboundEvent = Object.freeze({
  ENTER: 'enter_ivr',
  QUEUED: 'queued',
  ROUTED: 'routed',
  REJECT: 'reject',
  ABANDON: 'abandon',
  NO_AVAILABLE: 'no_available',
});

const InboundEventMapping = {
  PENDING: InboundEvent.QUEUED,
  READY: InboundEvent.ROUTED,
  NONE: InboundEvent.NO_AVAILABLE,
  '': InboundEvent.ENTER,
};

export const create = async ({
  number,
  language,
  incidentId,
  initContactId,
  ani,
  action = InboundEvent.ENTER,
}) => {
  const params = {
    dnis: number,
    language: await getLanguageId(language),
    incident_id: [incidentId],
    session_id: initContactId,
    action: InboundEventMapping[action] || InboundEvent.ENTER,
    ani,
  };
  console.log('creating inbound call...', params);
  const response = await axios.post('/phone_inbound', params);
  console.log('response:', response);
  const eventCallback = async (action) => {
    const _eventAction = action;
    console.log('executing inbound event callback:', action, _eventAction);
    await axios.post('/phone_inbound', { ...params, action: _eventAction });
  };
  return [response.data, eventCallback];
};

export const update = async (inbound, attributes) => {
  console.log('updating inbound call...');
  const response = await axios.patch(
    `/phone_inbound/${inbound.id}`,
    attributes,
  );
  console.log('update response:', response);
  return response.data;
};

export const prompt = async ({ inboundId, agentId }) => {
  console.log('prompting agent:', agentId);
  await axios.post(`/phone_inbound/${inboundId}/call`, {
    agent: agentId,
  });
};
