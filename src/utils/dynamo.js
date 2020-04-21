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
