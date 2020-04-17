/**
 * AWS Connect Streams Integrations
 */

import ACTIONS from './actions';
import { configureEndpoint } from './utils';
import WS from './ws';

export const checkWarmup = async ({ source }) => {
  if (source === 'serverless-warmup-plugin') {
    console.log('Warmup! Lambda is warm.');
    return true;
  }
  return false;
};

export const wsConnectionHandler = async (event, context) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  console.log('got ws connection', event, context);
  configureEndpoint(true);
  const { meta, action } = WS.parse(event);
  if (action === 'wsDisconnect') {
    return {
      statusCode: 200,
    };
  }
  return {
    statusCode: 200,
  };
};

export const wsHandler = async (event, context) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  console.log('got ws message', event, context);
  configureEndpoint(true);
  const { meta, action, data } = WS.parse(event);
  const response = await ACTIONS[action]({
    ...data,
    connectionId: meta.connectionId,
    client: 'ws',
  });
  if (response.action) {
    await WS.send({ meta, ...response });
  }
  return {
    statusCode: 200,
  };
};

export default async (event, context, callback) => {
  if (checkWarmup(event)) return { statusCode: 200 };
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
  const { status, data } = await ACTIONS[action]({
    ...params,
    client: 'connect',
  });
  console.log('action complete. returning data:', status, data);
  callback(status || null, data);
};
