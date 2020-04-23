/* eslint-disable camelcase */
/**
 * AWS Connect Streams Integrations
 */

import ACTIONS from './actions';
import { Client, Metrics } from './api';
import { configureEndpoint, CURRENT_ENDPOINT, Dynamo } from './utils';
import WS from './ws';

export const checkWarmup = ({ source }) => {
  if (source === 'serverless-warmup-plugin') {
    console.log('Warmup! Lambda is warm.');
    return true;
  }
  return false;
};

export const contactStreamHandler = async (event) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  const { Records } = event;
  console.log('[contacts] incoming contacts update:', Records);
  configureEndpoint();
  const adminClients = await Client.Client.allAdmins();
  const newImages = [];
  const metrics = new Metrics.Metrics();
  let queueCount = 0;
  Records.forEach(({ eventName, dynamodb: { NewImage } }) => {
    if (eventName === 'INSERT') {
      queueCount += 1;
    } else if (eventName === 'DELETE') {
      queueCount -= 1;
    }
    if (['INSERT', 'MODIFY'].includes(eventName)) {
      newImages.push(Dynamo.normalize(NewImage));
    }
  });
  if (queueCount >= 0) {
    await metrics.increment(Metrics.METRICS.QUEUED, queueCount);
  } else {
    await metrics.decrement(Metrics.METRICS.QUEUED, queueCount);
  }
  await adminClients.forEach(({ connection_id }) => {
    const payload = {
      namespace: 'phone',
      action: {
        type: 'action',
        name: 'setContactMetrics',
      },
      meta: {
        connectionId: connection_id,
        endpoint: CURRENT_ENDPOINT.ws,
      },
      data: {
        contacts: newImages,
      },
    };
    try {
      WS.send(payload);
    } catch (e) {
      console.log('[metrics] expired client found:', e);
    }
  });
  return {
    statusCode: 200,
  };
};
export const wsConnectionHandler = async (event, context) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  console.log('got ws connection', event, context);
  configureEndpoint();
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
  configureEndpoint();
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
  if (checkWarmup(event)) return callback(null, {});
  // Grab inbound number from event
  const {
    Details: {
      Parameters: { IS_OFFLINE, isDev, action, ...params },
    },
  } = event;

  // Use tunneled endpoints for local (sls offline) testing
  // Connect casts any passed attributes as strings
  if (IS_OFFLINE === '1') {
    process.env.IS_OFFLINE = 'TUNNEL';
    configureEndpoint({
      ws: 'http://marssocket.crisiscleanup.io',
      api: 'http://marsapi.crisiscleanup.io',
    });
  } else {
    configureEndpoint();
  }

  // Handlers
  const { status, data } = await ACTIONS[action]({
    ...params,
    client: 'connect',
  });
  console.log('action complete. returning data:', status, data);
  callback(status || null, data);
};
