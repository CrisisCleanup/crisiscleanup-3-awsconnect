/**
 * dynamo.js
 * DynamoDB Util
 */

import AWS from 'aws-sdk';
import AmazonDaxClient from 'amazon-dax-client';

let daxClient, ddbClient, dynamoClient;

export const dynamoOptions = () => {
  const isLocal = process.env.SLS_STAGE === 'local'; // serverless-offline
  let opts = {};
  if (isLocal) {
    opts = {
      region: 'localhost',
      endpoint:
        process.env.IS_OFFLINE === 'TUNNEL'
          ? 'http://marsdynamo.crisiscleanup.io'
          : 'http://localstack:4566',
    };
  }
  console.log('Dynamo Endpoints configured:', opts);
  console.log('DAX EP:', process.env.AWS_DAX_ENDPOINT);
  return opts;
};

export const TABLES = {
  AGENTS: {
    name: `connect-agents-table-${process.env.SLS_STAGE}`,
    hash: 'agent_id',
  },
  CONTACTS: {
    name: `connect-contacts-table-${process.env.SLS_STAGE}`,
  },
  CLIENTS: {
    name: `connect-clients-table-${process.env.SLS_STAGE}`,
  },
  METRICS: {
    name: `connect-metrics-table-${process.env.SLS_STAGE}`,
  },
};

export const DynamoTable = ({ name, bypassCache = false } = {}) => {
  const isLocal = process.env.SLS_STAGE === 'local'; // serverless-offline
  if (isLocal || bypassCache) {
    if (!dynamoClient) {
      dynamoClient = new AWS.DynamoDB({
        ...dynamoOptions(),
      });
    }
    return dynamoClient;
  }
  daxClient = new AmazonDaxClient({
    endpoints: [process.env.AWS_DAX_ENDPOINT],
  });
  return daxClient;
};

export const DynamoClient = ({ name } = {}) => {
  if (!daxClient) {
    DynamoTable();
  }
  if (dynamoClient) {
    if (!ddbClient) {
      ddbClient = new AWS.DynamoDB.DocumentClient({
        ...dynamoOptions(),
      });
    }
    return ddbClient;
  }
  if (!ddbClient) {
    ddbClient = new AWS.DynamoDB.DocumentClient({
      service: daxClient,
      ...dynamoOptions(),
    });
  }
  return ddbClient;
};

export const normalize = (record) => AWS.DynamoDB.Converter.unmarshall(record);

export const AttrExpression = ({ key = 's', name = 'state', value } = {}) => ({
  ExpressionAttributeNames: {
    [`#${key.toUpperCase()}`]: name,
  },
  ExpressionAttributeValues: {
    [`:${key.toLowerCase()}`]: value,
  },
});

export const Expressions = (exps) => {
  const finalExp = {
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
  };
  exps.forEach(({ valueOnly = false, keyOnly = false, ...exp } = {}) => {
    if (exp.value || typeof exp.value === 'number' || keyOnly || valueOnly) {
      const result = AttrExpression(exp);
      if (!valueOnly) {
        finalExp.ExpressionAttributeNames = {
          ...finalExp.ExpressionAttributeNames,
          ...result.ExpressionAttributeNames,
        };
      }
      if (!keyOnly) {
        finalExp.ExpressionAttributeValues = {
          ...finalExp.ExpressionAttributeValues,
          ...result.ExpressionAttributeValues,
        };
      }
    }
  });
  if (!Object.keys(finalExp.ExpressionAttributeNames).length) {
    return { ExpressionAttributeValues: finalExp.ExpressionAttributeValues };
  }
  if (!Object.keys(finalExp.ExpressionAttributeValues).length) {
    return { ExpressionAttributeNames: finalExp.ExpressionAttributeNames };
  }
  return finalExp;
};

// TTL Filter
export const expiredFilter = (
  { ExpressionAttributeNames = {}, ExpressionAttributeValues = {} } = {},
  { condition = false } = {},
) => {
  const newExp = {
    ...Expressions([
      { key: 'now', value: Math.floor(Date.now() / 1000), valueOnly: true },
      { key: 'x', name: 'ttl', keyOnly: true },
    ]),
  };
  return {
    ExpressionAttributeNames: {
      ...ExpressionAttributeNames,
      ...newExp.ExpressionAttributeNames,
    },
    ExpressionAttributeValues: {
      ...ExpressionAttributeValues,
      ...newExp.ExpressionAttributeValues,
    },
    [condition ? 'ConditionExpression' : 'FilterExpression']: '#X > :now',
  };
};
