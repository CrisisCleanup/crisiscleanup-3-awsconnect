/**
 * AWS Connect Streams Integrations
 */

import ACTIONS from './actions';
import { configureEndpoint } from './utils';

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
