/**
 * outbound.js
 * Api Outbound Module
 */

import axios from 'axios';
import { getLatestById } from '../utils';
import { getLanguageId } from './helpers';

export const getByPhoneNumber = async (number) => {
  // Format number
  const queryNumber = number.split('+')[1];
  const response = await axios.get('/phone_outbound', {
    params: { phone_number: queryNumber },
  });
  if (!response.status === 200) {
    // Throw exception to trigger 'no ID' path in connect
    console.error(number);
    throw new Error('failed to query outbound calls by phone number:');
  }
  console.log(response);
  const { results } = response.data;
  return results;
};

export const resolveCasesByNumber = async (number) => {
  // Query outbounds
  const outbounds = await getByPhoneNumber(number);

  // Filter for outbounds w/ valid pda/worksite id
  const cases = {
    pdas: [],
    worksites: [],
    ids: [],
  };

  outbounds.forEach(({ id, pda, worksite }) => {
    cases.ids.push(id);
    if (worksite !== null) {
      return cases.worksites.push(worksite);
    }
    if (pda !== null) {
      return cases.pdas.push(pda);
    }
  });
  console.log('cases', cases);
  return cases;
};

export const create = async (number, language, incidentId) => {
  // Params
  const params = {
    dnis1: number,
    call_type: 'callback',
    language: await getLanguageId(language),
    incident_id: [incidentId],
  };
  console.log('creating callback...', params);

  const response = await axios.post('/phone_outbound', params);
  console.log('callback response: ', response);
  return response;
};

export const unlock = async (inboundNumber) => {
  const outbounds = await getByPhoneNumber(inboundNumber);
  const latestId = getLatestById(outbounds);
  console.log('outbound id found:', latestId);

  // Unlock outbound
  const resp = await axios.post(`/phone_outbound/${latestId}/unlock`);
  return resp;
};