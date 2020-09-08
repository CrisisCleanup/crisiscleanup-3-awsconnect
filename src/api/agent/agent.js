/* eslint-disable camelcase */
/**
 * agent.js
 * Agent Module
 */

import { Dynamo } from '../../utils';
import ApiModel from '../api';
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
    const results = await db.scan({ TableName: Dynamo.TABLES.AGENTS.name }).promise();
    const { Items } = results;
    return Items;
  }

  static async countByState(state) {
    const db = Dynamo.DynamoClient(Dynamo.TABLES.AGENTS);
    const query = OPS.queryAgentsByState({ dbTable: Dynamo.TABLES.AGENTS.name, selector: 'COUNT' });
    console.log('[agents] making query:', query);
    const results = await db.query(query).promise();
    const { Count } = results;
    console.log(`[agents] got ${Count} agents by state: ${state}`);
    return Count;
  }

  static async getInCall({ countOnly = true } = {}) {
    const db = Dynamo.DynamoClient(Dynamo.TABLES.AGENTS);
    const query = OPS.queryActiveFilter({
      dbTable: Dynamo.TABLES.AGENTS.name,
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

  static async updateConnection({ agentId, connectionId, agentState }) {
    const db = Dynamo.DynamoClient(Dynamo.TABLES.AGENTS);
    const query = OPS.updateConnectionId({ dbTable: Dynamo.TABLES.AGENTS.name, agentId, connectionId });
    console.log('[agents] updating connection:', query);
    const results = await db.update(query).promise();
    if (agentState) {
      const agStateQuery = OPS.updateStateByHeartbeat({ dbTable: Dynamo.TABLES.AGENTS.name, agentId, agentState });
      console.log('[agents] updating state by connection:', agStateQuery);
      try {
        await db.update(agStateQuery).promise();
      } catch (e) {
        console.log(e);
      }
    }
    return results;
  }

  static async refreshMetrics() {
    const agentsOnline = await Agent.countByState('online');
    const agentsAvailable = await Agent.countByState('online#routable');
    const agentsOnCall = await Agent.getInCall({ countOnly: true });
    try {
      const metrics = new Metrics();
      await metrics.update(METRICS.ONLINE, agentsOnline);
      await metrics.update(METRICS.AVAILABLE, agentsAvailable);
      await metrics.update(METRICS.ON_CALL, agentsOnCall);
    } catch (e) {
      console.log('Ran into an error updating metrics!', e);
    }
  }
}
