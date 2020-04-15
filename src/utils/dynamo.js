/**
 * dynamo.js
 * DynamoDB Util
 */

import AWS from 'aws-sdk';

export const TABLES = {
  AGENTS: {
    name: 'connect-agents-table',
    hash: 'agent_id',
  },
};

export const DynamoTable = ({ name }) =>
  new AWS.DynamoDB({
    params: { TableName: name },
    apiVersion: '2012-08-10',
  });

export const normalize = (record) => AWS.DynamoDB.Converter.unmarshall(record);
