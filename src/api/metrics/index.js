/**
 * index.js
 * Metrics Module
 */

import { Dynamo } from '../../utils';
import ApiModel from '../api';
import * as OPS from './operations';
import { LANGUAGE } from '../helpers';

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

  async performUpdate(operation, { locale, metric, ...args }) {
    const locales = locale.split('#');
    const results = await Promise.all(
      locales.map((l) => {
        const op = operation({
          dbTable: this.dbTable,
          name: `${metric}#${l}`,
          ...args,
        });
        this.log('performing update operation:', op);
        return this.db.update(op).promise();
      }),
    );
    const op = operation({
      dbTable: this.dbTable,
      name: metric,
      ...args,
    });
    this.log('performing total update:', op);
    await this.db.update(op).promise();
    return results;
  }

  async increment(metric, amount = 1, locale = LANGUAGE.en_US) {
    this.log(`incrementing metric: ${metric}`);
    const results = await this.performUpdate(OPS.incrementMetric, {
      locale,
      metric,
      amount,
    });
    this.log('results:', results);
    return results;
  }

  async decrement(metric, amount = 1, locale = LANGUAGE.en_US) {
    this.log(`decrementing metric: ${metric}`);
    const results = await this.performUpdate(OPS.decrementValue, {
      locale,
      metric,
      amount,
    });
    this.log('results:', results);
    return results;
  }

  async update(metric, value, locale = LANGUAGE.en_US) {
    this.log(`setting metric: [${metric}] => ${value}`);
    const results = await this.performUpdate(OPS.setValue, {
      locale,
      metric,
      value,
    });
    this.log('results:', results);
    return results;
  }

  async getRealtime() {
    this.log('fetching realtime metrics...');
    const query = OPS.getRealtime({ dbTable: this.dbTable });
    this.log('realtime query:', query);
    const results = await this.db.query(query).promise();
    this.log('results:', results);
    const { Items } = results;
    return Items;
  }
}
