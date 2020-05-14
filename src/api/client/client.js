/* eslint-disable camelcase */
/**
 * client.js
 * Client Moudle
 */

import { CURRENT_ENDPOINT, Dynamo } from '../../utils';
import { expiredFilter } from '../../utils/dynamo';
import WS from '../../ws';
import Agent from '../agent/agent';
import ApiModel from '../api';
import * as OPS from './operations';

export const TYPES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

export class Client extends ApiModel {
  constructor({ connectionId, userId, type } = {}) {
    super({ dbTable: Dynamo.TABLES.CLIENTS });
    this.connectionId = connectionId;
    this.userId = userId;
    this.type = type;
    this.loggerName = `client[${this.connectionId}|${this.userId}]`;
  }

  async delete() {
    this.log('manually flushing client...');
    await this.db.delete(OPS.deleteClient(this)).promise();
  }

  get isAdmin() {
    return this.type === TYPES.admin;
  }

  static async allAdmins() {
    const dbClient = Dynamo.DynamoClient(Dynamo.TABLES.CLIENTS);
    const results = await dbClient.query(OPS.queryByType('admin')).promise();
    const { Items } = results;
    return Items;
  }

  static async all() {
    const dbClient = Dynamo.DynamoClient(Dynamo.TABLES.CLIENTS);
    const results = await dbClient.scan(expiredFilter()).promise();
    const { Items } = results;
    return Items;
  }

  async heartbeat(agentId) {
    this.log('heartbeat received!');
    this.log('client type:', this.type);
    const query = OPS.updateClient(this);
    this.log('making update:', query);
    const results = await this.db.update(query).promise();
    this.log('results:');
    this.log(results);
    if (agentId) {
      await Agent.updateConnection({
        agentId,
        connectionId: this.connectionId,
      });
    }
    return results;
  }

  async load() {
    this.log('fetching client from database...');
    let response;
    if (!this.userId && this.connectionId) {
      this.log('user id is unknown! trying to find client by connection id!');
      try {
        response = await this.db.query(OPS.queryByConnection(this)).promise();
        const { Items } = response;
        const [clientItem] = Items;
        if (!clientItem) {
          throw new Error('no results!');
        }
        response = { Item: clientItem };
      } catch (e) {
        this.log('could not find client by connection id!');
      }
    }
    try {
      response = await this.db.get(OPS.getClient(this)).promise();
    } catch (e) {
      this.log('could not find client! assumings its new...');
      return this;
    }
    const { Item } = response;
    if (!Item || Item === null) {
      this.log('could not find client! assuming its new...');
      return this;
    }
    this.log('found existing client:', Item);
    const { connection_id, user_id, client_type, ttl } = Item;
    if (!(ttl > Math.floor(Date.now() / 1000))) {
      this.log('client expired! recreating...');
      try {
        await this.delete();
      } catch (e) {
        this.log('error occured when trying to delete client:');
        this.log(e);
      }
      return this;
    }
    if (this.connectionId && this.connectionId !== connection_id) {
      this.log('newer connection id found, updating!');
      await this.heartbeat();
    } else {
      this.connectionId = connection_id;
    }
    this.userId = user_id;
    this.type = client_type;
    return this;
  }

  async send({ namespace, action, data } = {}) {
    const payload = {
      namespace,
      action,
      data,
      meta: {
        connectionId: this.connectionId,
        endpoint: CURRENT_ENDPOINT.ws,
      },
    };
    this.log('sending message:', payload);
    await WS.send(payload);
  }
}
