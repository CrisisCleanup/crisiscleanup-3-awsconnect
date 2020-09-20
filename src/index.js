/* eslint-disable camelcase */
/**
 * AWS Connect Streams Integrations
 */

import ACTIONS from './actions';
import { Client, Metrics } from './api';
import { configureEndpoint, CURRENT_ENDPOINT, Dynamo } from './utils';
import WS from './ws';
import RESP from './ws/response';
import { LANGUAGE } from './api/helpers';
import Agent from './api/agent';
import { METRICS } from './api/metrics';
import { AGENT_ATTRS } from './api/agent/legacy';

// Configure during lambda init
configureEndpoint();

export const checkWarmup = ({ source } = {}) => {
  if (source === 'serverless-plugin-warmup') {
    console.log('Warmup! Lambda is warm.');
    return true;
  }
  return false;
};

export const agentStreamHandler = async (event) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  const { Records } = event;
  console.log('[agents] incoming agents update:', Records);
  const clients = await Client.Client.all();
  const newImages = [];
  const metricUpdates = {
    [METRICS.ONLINE]: {
      all: 0,
    },
    [METRICS.AVAILABLE]: {
      all: 0,
    },
    [METRICS.ON_CALL]: {
      all: 0,
    },
  };
  Records.forEach(({ eventName, dynamodb: { NewImage, OldImage } }) => {
    if (['INSERT', 'MODIFY'].includes(eventName)) {
      let oldItem = null;
      let wasOnline = false;
      let wasRoutable = false;
      let wasConnected = false;

      if (OldImage) {
        oldItem = Dynamo.normalize(OldImage);
        wasOnline = Agent.isOnline(oldItem.state);
        wasRoutable = Agent.isRoutable(oldItem.state);
        wasConnected = Object.keys(oldItem).includes(
          AGENT_ATTRS.CURRENT_CONTACT,
        );
      }

      const newItem = Dynamo.normalize(NewImage);

      const isOnline = Agent.isOnline(newItem.state);
      const isRoutable = Agent.isRoutable(newItem.state);
      const isConnected = Object.keys(newItem).includes(
        AGENT_ATTRS.CURRENT_CONTACT,
      );

      if (wasOnline === false && isOnline === true) {
        // Agent OFFLINE -> ONLINE
        metricUpdates[METRICS.ONLINE][newItem.locale] =
          (metricUpdates[METRICS.ONLINE][newItem.locale] || 0) + 1;
      }
      if (wasOnline === true && isOnline === false) {
        // Agent ONLINE -> OFFLINE
        metricUpdates[METRICS.ONLINE][newItem.locale] =
          (metricUpdates[METRICS.ONLINE][newItem.locale] || 0) - 1;
      }
      if (wasRoutable === false && isRoutable === true) {
        // Agent NOT_ROUTABLE -> ROUTABLE
        metricUpdates[METRICS.AVAILABLE][newItem.locale] =
          (metricUpdates[METRICS.AVAILABLE][newItem.locale] || 0) + 1;
      }
      if (wasRoutable === true && isRoutable === false) {
        // Agent ROUTABLE -> NOT_ROUTABLE
        metricUpdates[METRICS.AVAILABLE][newItem.locale] =
          (metricUpdates[METRICS.AVAILABLE][newItem.locale] || 0) - 1;
      }
      if (wasConnected === true && isConnected === false) {
        // Agent on phone -> off phone
        metricUpdates[METRICS.ON_CALL][newItem.locale] =
          (metricUpdates[METRICS.ON_CALL][newItem.locale] || 0) - 1;
      }
      if (wasConnected === false && isConnected === true) {
        // Agent off phone -> on phone
        metricUpdates[METRICS.ON_CALL][newItem.locale] =
          (metricUpdates[METRICS.ON_CALL][newItem.locale] || 0) + 1;
      }
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
          ...RESP.UPDATE_AGENT_METRICS({ agents: newImages }),
        });
      } catch (e) {
        // catch old/expired/disconnected clients
        console.log('[agents] ran into exception while sending payload:', e);
      }
    }),
  );

  const metric = new Metrics.Metrics();

  await Promise.all(
    Object.keys(metricUpdates).map((metricName) => {
      Object.entries(metricUpdates[metricName]).forEach(([localeK, val]) => {
        if (val >= 1) {
          return metric.increment(metricName, val, localeK);
        }
        if (val < 0) {
          return metric.decrement(metricName, Math.abs(val), localeK);
        }
      });
    }),
  );

  return {
    statusCode: 200,
  };
};

export const contactStreamHandler = async (event, context) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  const { Records } = event;
  console.log('[contacts] incoming contacts update:', Records);
  const adminClients = await Client.Client.allAdmins();
  const newImages = [];
  const metrics = new Metrics.Metrics();
  const queueCounts = {
    [LANGUAGE.en_US]: 0,
    [LANGUAGE.es_MX]: 0,
  };
  Records.forEach(({ eventName, dynamodb: { NewImage, OldImage } }) => {
    let contactLocale = LANGUAGE.en_US;
    if (eventName === 'DELETE' || eventName === 'REMOVE') {
      contactLocale = OldImage ? OldImage['locale'] : contactLocale;
    } else {
      contactLocale = NewImage ? NewImage['locale'] : contactLocale;
    }
    if (eventName === 'INSERT') {
      queueCounts[contactLocale] += 1;
    } else if (eventName === 'DELETE' || eventName === 'REMOVE') {
      queueCounts[contactLocale] -= 1;
    }
    if (['INSERT', 'MODIFY', 'REMOVE', 'DELETE'].includes(eventName)) {
      newImages.push(Dynamo.normalize(NewImage));
    }
  });
  await Object.keys(queueCounts).map((k) => {
    if (queueCounts[k] >= 0) {
      metrics.increment(Metrics.METRICS.QUEUED, queueCounts[k], k);
    } else {
      metrics.decrement(Metrics.METRICS.QUEUED, queueCounts[k], k);
    }
  });
  await adminClients.forEach(({ connection_id }) => {
    const payload = {
      meta: {
        connectionId: connection_id,
        endpoint: CURRENT_ENDPOINT.ws,
      },
      ...RESP.UPDATE_CONTACT_METRICS({ contacts: newImages }),
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
};

export const metricStreamHandler = async (event, context) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  const { Records } = event;
  console.log('[metrics] incoming metric update:', Records);
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
        meta: {
          connectionId: connection_id,
          endpoint: CURRENT_ENDPOINT.ws,
        },
        ...RESP.UPDATE_METRICS({ metrics: metricPayload }),
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
};

export const wsConnectionHandler = async (event, context) => {
  if (checkWarmup(event)) return { statusCode: 200 };
  console.log('got ws connection', event, context);
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

export default async (event, context, callback) => {
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
};
