/**
 * index.js
 * Metrics Module
 */

import { Dynamo } from '../../utils';
import ApiModel from '../api';
import * as OPS from './operations';

export const METRICS = Object.freeze({
  AVAILABLE: 'AGENTS_AVAILABLE',
  ONLINE: 'AGENTS_ONLINE',
  ON_CALL: 'AGENTS_ON_CALL',
  QUEUED: 'CONTACTS_IN_QUEUE',
  CALLBACKS: 'CONTACTS_IN_QUEUE_OUTBOUND',
});

export class Metrics extends ApiModel {
  constructor() {
    super({ dbTable: Dynamo.TABLES.METRICS });
    this.loggerName = '[metrics]';
  }

  async increment(metric, amount = 1) {
    this.log(`incrementing metric: ${metric}`);
    const results = await this.db
      .update(OPS.incrementMetric({ name: metric, amount }))
      .promise();
    this.log('results:', results);
    return results;
  }

  async decrement(metric, amount = 1) {
    this.log(`decrementing metric: ${metric}`);
    const results = await this.db
      .update(OPS.decrementValue({ name: metric, amount }))
      .promise();
    this.log('results:', results);
    return results;
  }

  async update(metric, value) {
    this.log(`setting metric: [${metric}] => ${value}`);
    const results = await this.db
      .update(OPS.setValue({ name: metric, value }))
      .promise();
    this.log('results:', results);
    return results;
  }
}
