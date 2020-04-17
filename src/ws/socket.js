/**
 * socket.js
 * WebSockets Module
 */

import AWS from 'aws-sdk';

export const send = async ({ meta, ...data }) => {
  const { endpoint, connectionId } = meta;
  const gateway = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint,
  });
  const Data = JSON.stringify(data);
  console.log('outgoing payload:', Data);
  console.log('outgoing meta:', meta);
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
    requestContext: { domainName, stage, connectionId, eventType },
    body,
  } = event;
  const domainUrl = new URL(`https://${domainName}`);
  let callbackUrl = domainUrl;
  if (domainName.includes('amazon')) {
    callbackUrl = new URL(stage, domainUrl);
  }
  callbackUrl = callbackUrl.toString();
  console.log('generated callback url:', callbackUrl);
  if (domainName === 'localhost') {
    callbackUrl = 'http://localhost:3001';
  }
  const meta = {
    endpoint: callbackUrl,
    connectionId,
  };
  console.log('parsed metadata:', meta);
  if (eventType === 'DISCONNECT') {
    return { meta, action: 'wsDisconnect' };
  }
  if (!body) {
    return { meta };
  }
  console.log('parsing incoming data:', body);
  const { options, action, data } = JSON.parse(body);
  let parsedData = data;
  if (options && options.includeMeta) {
    parsedData = { ...data, ...meta };
  }
  return {
    action,
    data: parsedData,
    meta,
  };
};
