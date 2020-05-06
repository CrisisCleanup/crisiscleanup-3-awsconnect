/**
 * dynamo.js
 * DynamoDB Util
 */

import AWS from 'aws-sdk';

const isLocal = process.env.IS_OFFLINE; // serverless-offline

const localOptions = () => {
  const opts = {
    region: 'localhost',
    endpoint:
      process.env.IS_OFFLINE === 'TUNNEL'
        ? 'http://marsdynamo.crisiscleanup.io'
        : 'http://localhost:8000',
  };
  console.log('Dynamo Endpoints configured:', opts);
  return opts;
};

// const dynamoOptions = () => (isLocal ? localOptions() : {});
const dynamoOptions = () => (isLocal ? {} : {});

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

export const DynamoTable = ({ name }) =>
  new AWS.DynamoDB({
    params: { TableName: name },
    apiVersion: '2012-08-10',
    ...dynamoOptions(),
  });

export const DynamoClient = ({ name }) =>
  new AWS.DynamoDB.DocumentClient({
    params: { TableName: name },
    ...dynamoOptions(),
  });

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
