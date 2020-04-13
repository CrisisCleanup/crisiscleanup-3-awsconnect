/**
 * AWS Connect Streams Integrations
 */

import { Outbound } from './api';
import { configureEndpoint } from './utils';

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

const createCallback = async ({ inboundNumber, userLanguage, incidentId }) => {
  const response = await Outbound.create(
    inboundNumber,
    userLanguage,
    incidentId,
  );
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

const denyCallback = async ({ inboundNumber }) => {
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

const ACTIONS = {
  CHECK_CASE: checkCases,
  CALLBACK: createCallback,
  DENIED_CALLBACK: denyCallback,
};

export default async (event, context, callback) => {
  // Grab inbound number from event
  const {
    Details: {
      Parameters: { isDev, action, ...params },
    },
  } = event;

  // Store IS_DEV
  process.env.IS_DEV = isDev;
  configureEndpoint(isDev);

  // Handlers
  const { status, data } = await ACTIONS[action](params);
  console.log('action complete. returning data:', status, data);
  callback(status || null, data);
};
