/**
 * socket.js
 * WebSockets Module
 */

import AWS from 'aws-sdk';

export const send = async ({ meta, payload }) => {
  const { endpoint, connectionId } = meta;
  const gateway = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint,
  });
  const Data = JSON.stringify(payload);
  console.log('outgoing payload:', Data);
  const result = await gateway
    .postToConnection({
      ConnectionId: connectionId,
      Data,
    })
    .promise();
  return result;
};

export const parse = (event) => {
  const {
    requestContext: { domainName, stage, connectionId },
    body,
  } = event;
  const domainUrl = new URL(`https://${domainName}`);
  let callbackUrl = new URL(stage, domainUrl).toString();
  if (domainName === 'localhost') {
    callbackUrl = 'http://localhost:3001';
  }
  const { action, data } = JSON.parse(body);
  return {
    action,
    data,
    meta: {
      endpoint: callbackUrl,
      connectionId,
    },
  };
};
