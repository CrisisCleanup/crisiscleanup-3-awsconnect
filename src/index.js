/* eslint-disable camelcase */
/**
 * AWS Connect Streams Integrations
 */

import Raven from 'raven';
import RavenWrapper from 'serverless-sentry-lib';
import ACTIONS from './actions';
import { Client, Metrics } from './api';
import { configureEndpoint, CURRENT_ENDPOINT, Dynamo } from './utils';
import WS from './ws';

// Configure during lambda init
configureEndpoint();

export const checkWarmup = ({ source }) => {
  if (source === 'serverless-plugin-warmup') {
    console.log('Warmup! Lambda is warm.');
    return true;
  }
  return false;
};

export const agentStreamHandler = RavenWrapper.handler(Raven, async (event) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  const { Records } = event;
  console.log('[agents] incoming agents update:', Records);
  configureEndpoint();
  const clients = await Client.Client.all();
  const newImages = [];
  Records.forEach(({ eventName, dynamodb: { NewImage } }) => {
    if (['INSERT', 'MODIFY'].includes(eventName)) {
      newImages.push(Dynamo.normalize(NewImage));
    }
  });
  await Promise.all(
    clients.map(async ({ user_id, connection_id }) => {
      const clientObj = new Client.Client({
        userId: user_id,
        connectionId: connection_id,
      });
      try {
        await clientObj.send({
          namespace: 'phone',
          action: {
            type: 'action',
            name: 'getAgentMetrics',
          },
          data: {
            agents: newImages,
          },
        });
      } catch (e) {
        // catch old/expired/disconnected clients
        console.log('[agents] ran into exception while sending payload:', e);
      }
    }),
  );
  return {
    statusCode: 200,
  };
});

export const contactStreamHandler = RavenWrapper.handler(
  Raven,
  async (event, context) => {
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
      if (['INSERT', 'MODIFY', 'DELETE'].includes(eventName)) {
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
        context.serverlessSdk.captureError(e);
      }
    });
    return {
      statusCode: 200,
    };
  },
);

export const metricStreamHandler = RavenWrapper.handler(
  Raven,
  async (event, context) => {
    if (checkWarmup(event)) return { statusCode: 200 };
    const { Records } = event;
    console.log('[metrics] incoming metric update:', Records);
    configureEndpoint();
    const clients = await Client.Client.all();
    const metricPayload = [];
    Records.forEach(({ eventName, dynamodb: { NewImage } }) => {
      if (['INSERT', 'MODIFY'].includes(eventName)) {
        console.log('[metrics] metric update:', NewImage);
        metricPayload.push(Dynamo.normalize(NewImage));
      }
    });
    console.log(
      `[metrics] sending new metric data to ${clients.length} online clients...`,
    );
    await Promise.all(
      clients.map(async ({ connection_id }) => {
        const payload = {
          namespace: 'phone',
          action: {
            type: 'action',
            name: 'getRealtimeMetrics',
          },
          meta: {
            connectionId: connection_id,
            endpoint: CURRENT_ENDPOINT.ws,
          },
          data: {
            metrics: metricPayload,
          },
        };
        try {
          await WS.send(payload);
        } catch (e) {
          console.log('[metrics] expired client found:', e);
          context.serverlessSdk.captureError(e);
        }
      }),
    );
    return {
      statusCode: 200,
    };
  },
);

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
  if (!action) {
    console.log('[wsHandler] no action specified!');
    return {
      statusCode: 200,
    };
  }
  console.log('[wsHandler] entering action:', action);
  console.log('[wsHandler] passing args to action:', data);
  try {
    const response = await ACTIONS[action]({
      ...data,
      connectionId: meta.connectionId,
      client: 'ws',
    });
    console.log('[wsHandler] action completed, response:', response);
    if (response && response.action) {
      await WS.send({ meta, ...response });
    }
  } catch (e) {
    console.log('[wsHandler] failed!');
    console.log('[wsHandler] exception raised: ', e);
    context.serverlessSdk.captureError(e);
  }
  return {
    statusCode: 200,
  };
};

export default RavenWrapper.handler(Raven, async (event, context, callback) => {
  if (checkWarmup(event)) return callback(null, {});
  // Grab inbound number from event
  const {
    Details: {
      Parameters: { IS_OFFLINE, isDev, action, ...params },
      ContactData,
    },
  } = event;

  console.log('[awsConnect] entering action:', action);
  console.log('[awsConnect] event inputs:', event, context);
  console.log('[awsConnect] contact attributes: ', ContactData.Attributes);

  configureEndpoint();

  // Handlers
  const actionArgs = {
    ...params,
    contactData: ContactData,
    client: 'connect',
  };
  console.log(`[awsConnect] passing args to action (${action}):`, actionArgs);
  const { status, data } = await ACTIONS[action](actionArgs);
  console.log('action complete. returning data:', status, data);
  callback(status || null, data);
});
