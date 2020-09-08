/* eslint-disable camelcase */
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
  if (response.status !== 200) {
    // Throw exception to trigger 'no ID' path in connect
    console.error(number);
    throw new Error('failed to query outbound calls by phone number:');
  }
  console.log(response);
  const { results } = response.data;
  return results;
};

export const getWorksitesByPhoneNumber = async (
  contactId,
  number,
  incidentId = -1,
) => {
  // Format number
  const queryNumber = number.split('+')[1];
  const response = await axios.post('/phone_connect/resolve_cases', {
    phone_number: queryNumber,
    contact_id: contactId,
  });
  if (response.status !== 200) {
    console.log('failed to fetch worksites by number!');
    console.error(number);
    return [];
  }
  console.log(response);
  const { data } = response;
  return data;
};

export const resolveCasesByNumber = async (contactId, number, incidentId) => {
  // Query outbounds
  await getWorksitesByPhoneNumber(contactId, number, incidentId);

  // DEPRECATED: This is only here cause old connect
  // flows expect it to be. Cases are now resolved
  // asynchronously by the api.
  // Filter for outbounds w/ valid pda/worksite id
  const cases = {
    pdas: [],
    worksites: [],
    ids: [],
  };

  return cases;
};

export const create = async (
  number,
  language,
  incidentId,
  initContactId,
  callAni,
) => {
  // Params
  const params = {
    dnis1: number,
    call_type: 'callback',
    language: await getLanguageId(language),
    incident_id: [incidentId],
    external_id: initContactId,
    external_platform: 'connect',
    ani: callAni,
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
