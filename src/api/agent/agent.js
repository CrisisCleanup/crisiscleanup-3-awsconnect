/* eslint-disable camelcase */
/**
 * agent.js
 * Agent Module
 */

import { CURRENT_ENDPOINT, Dynamo } from '../../utils';
import WS from '../../ws';
import ApiModel from '../api';
import Client from '../client';
import { METRICS, Metrics } from '../metrics';
import * as OPS from './operations';

export default class Agent extends ApiModel {
  constructor({ agentId, agentState } = {}) {
    super({ dbTable: Dynamo.TABLES.AGENTS });
    this.agentId = agentId;
    this.state = agentState;
    this.loggerName = `agent[${this.agentId}|${this.state}]`;
  }

  static async getAll() {
    const db = Dynamo.DynamoClient(Dynamo.TABLES.AGENTS);
    const results = await db.scan().promise();
    const { Items } = results;
    return Items;
  }

  static async countByState(state) {
    const db = Dynamo.DynamoClient(Dynamo.TABLES.AGENTS);
    const query = OPS.queryAgentsByState({ state, selector: 'COUNT' });
    console.log('[agents] making query:', query);
    const results = await db.query(query).promise();
    const { Count } = results;
    console.log(`[agents] got ${Count} agents by state: ${state}`);
    return Count;
  }

  static async getInCall({ countOnly = true } = {}) {
    const db = Dynamo.DynamoClient(Dynamo.TABLES.AGENTS);
    const query = OPS.queryActiveFilter({
      filter: 'attribute_exists(current_contact_id)',
      selector: countOnly ? 'COUNT' : 'ALL_ATTRIBUTES',
    });
    console.log('[agents] making query:', query);
    const results = await db.query(query).promise();
    if (countOnly) {
      const { Count } = results;
      console.log(`[agents] got ${Count} in call w/ active contact.`);
      return Count;
    }
    const { Items } = results;
    return Items;
  }

  static async refreshMetrics() {
    const agentsOnline = await Agent.countByState('online');
    const agentsAvailable = await Agent.countByState('online#routable');
    const agentsOnCall = await Agent.getInCall({ countOnly: true });
    const metrics = new Metrics();
    await metrics.update(METRICS.ONLINE, agentsOnline);
    await metrics.update(METRICS.AVAILABLE, agentsAvailable);
    await metrics.update(METRICS.ON_CALL, agentsOnCall);
    const clients = await Client.Client.all();
    const results = await Promise.all(
      clients.map(async ({ connection_id, user_id }) => {
        console.log(`[agents] sending metrics to: ${user_id}`);
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
            metrics: [
              {
                name: METRICS.ONLINE,
                type: 'realtime',
                value: agentsOnline,
              },
              {
                name: METRICS.AVAILABLE,
                type: 'realtime',
                value: agentsAvailable,
              },
              {
                name: METRICS.ON_CALL,
                type: 'realtime',
                value: agentsOnCall,
              },
            ],
          },
        };
        try {
          await WS.send(payload);
        } catch (e) {
          console.log('ran into an error, is the connection stale?');
          console.log(e);
        }
      }),
    );
    console.log('[agents] sent results:', results);
    return results;
  }
}
