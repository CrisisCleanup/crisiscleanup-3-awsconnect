/**
 * agent.js
 * Agent Api Module
 */

import { Dynamo } from '../utils';

const TABLE = Dynamo.TABLES.AGENTS;

export const AGENT_STATES = Object.freeze({
  PENDING_CALL: 'pendingCall',
  ROUTABLE: 'routable',
  ON_CALL: 'onCall',
  OFFLINE: 'offline',
});

export const KeyMap = ({ mapName = 'Key', agentId, attributes = {} }) => ({
  [mapName]: {
    [TABLE.hash]: {
      S: agentId,
    },
    ...attributes,
  },
});

export const setState = async ({ agentId, agentState, initContactId = '' }) => {
  const db = Dynamo.DynamoTable(TABLE);
  const params = {
    ...KeyMap({
      mapName: 'Item',
      agentId,
      agentState,
      attributes: {
        state: {
          S: agentState,
        },
        entered_timestamp: {
          S: new Date().toISOString(),
        },
        last_contact_id: {
          S: initContactId,
        },
      },
    }),
  };
  console.log('setting state params:', params);
  const results = await db.putItem(params).promise();
  console.log('set agent state: ', agentId, agentState, results);
};
