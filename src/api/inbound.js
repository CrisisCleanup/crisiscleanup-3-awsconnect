/**
 * inbound.js
 * Inbound Api
 */

import axios from 'axios';
import { getLanguageId } from './helpers';

export const create = async ({
  number,
  language,
  incidentId,
  initContactId,
  ani,
}) => {
  const params = {
    dnis: number,
    language: await getLanguageId(language),
    incident_id: [incidentId],
    session_id: initContactId,
    ani,
  };
  console.log('creating inbound call...', params);
  const response = await axios.post('/phone_inbound', params);
  console.log('response:', response);
  return response.data;
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
