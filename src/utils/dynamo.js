/**
 * dynamo.js
 * DynamoDB Util
 */

import AWS from 'aws-sdk';

export const TABLES = {
  AGENTS: {
    name: 'connect-agents-table',
    hash: 'agent_id',
    range: 'state',
  },
};

export const DynamoTable = ({ name }) =>
  new AWS.DynamoDB({
    params: { TableName: name },
    apiVersion: '2012-08-10',
  });
