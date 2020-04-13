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

const ACTIONS = {
  CHECK_CASE: checkCases,
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
