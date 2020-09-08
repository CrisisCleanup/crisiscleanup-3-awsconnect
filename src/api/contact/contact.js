/* eslint-disable camelcase */
/**
 * contact.js
 * Contact Module
 */

import { Dynamo } from '../../utils';
import ApiModel from '../api';
import * as OPS from './operations';

export const OPERATIONS = OPS;

export const CONTACT_STATES = Object.freeze({
  QUEUED: 'queued',
  ROUTED: 'routed',
});

export const CONTACT_LANG = Object.freeze({
  en_US: 2,
  es_MX: 7,
});

export const CONTACT_ACTIONS = Object.freeze({
  ENTER: 'enter_ivr',
  CONNECTED: 'connected',
  ENDED: 'ended',
  CONNECTING: 'connecting',
  ERROR: 'error',
});

export const actionIsRouted = (action) => action !== CONTACT_ACTIONS.ENTER;

export class Contact extends ApiModel {
  constructor(params = {}) {
    const { contactId, contactRouted, contactLocale, action, agentId } = params;
    super({ dbTable: Dynamo.TABLES.CONTACTS });
    this.contactId = contactId;
    this.locale = contactLocale || CONTACT_LANG.en_US;
    this.currentAction = action || 'enter_ivr';
    this.routed =
      contactRouted === undefined ? actionIsRouted(this.action) : contactRouted;
    this.priority = 1;
    this.entered_timestamp = null;
    this.ttl = null;
    this.agentId = agentId || 'none';
    this.casesData = {
      pdas: '-1',
      worksites: '-1',
      ids: '-1',
    };
    this.loggerName = `contact[${this.contactId}|${this.state}]`;
  }

  get action() {
    return this.currentAction;
  }

  set action(value) {
    this.currentAction = value;
    this.routed = actionIsRouted(value);
    return value;
  }

  get cases() {
    const { pdas, worksites, ids } = this.casesData;
    return {
      pdas: pdas === '-1' ? '' : pdas,
      worksites: worksites === '-1' ? '' : worksites,
      ids: ids === '-1' ? '' : ids,
    };
  }

  set cases({ pdas, worksites, ids }) {
    this.casesData = {
      pdas: pdas === undefined ? '-1' : pdas,
      worksites: worksites === undefined ? '-1' : worksites,
      ids: ids === undefined ? '-1' : ids,
    };
    return this.cases;
  }

  get localeName() {
    return Object.keys(CONTACT_LANG).find(
      (k) => CONTACT_LANG[k] === this.locale,
    );
  }

  get state() {
    const routeState = this.routed
      ? CONTACT_STATES.ROUTED
      : CONTACT_STATES.QUEUED;
    return `${this.localeName}#${routeState}`;
  }

  set state(value) {
    let routeValue = value;
    let localeValue = this.localeName;
    if (value.includes('#')) {
      [localeValue, routeValue] = value.split('#');
    }
    const routed =
      CONTACT_STATES[routeValue.toUpperCase()] === CONTACT_STATES.ROUTED;
    this.log(
      `updating state -> ${localeValue}#${
        this.routed ? CONTACT_STATES.ROUTED : CONTACT_STATES.QUEUED
      }`,
    );
    this.locale = CONTACT_LANG[localeValue];
    this.routed = routed;
    return this.state;
  }

  get routeState() {
    if (this.state.includes('#')) {
      const [, routeState] = this.state.split('#');
      return routeState;
    }
    return this.state;
  }

  async getAll() {
    this.log('fetching all contacts!');
    const results = await this.db.scan({
      TableName: Dynamo.TABLES.CONTACTS.name,
      ...Dynamo.expiredFilter()
    }).promise();
    this.log(`scan results: ${results}`);
    this.log(results);
    const { Items } = results;
    return Items;
  }

  static async numContactsInQueue() {
    console.log('[contacts] counting num contacts in queue...');
    const db = Dynamo.DynamoClient(Dynamo.TABLES.CONTACTS);
    const results = await db
      .query(OPS.queryNumByState({ dbTable: Dynamo.TABLES.CONTACTS.name, state: 'en_US#queued' }))
      .promise();
    const { Count } = results;
    return Count;
  }

  async setState(newState) {
    if (newState) {
      this.state = newState;
    }
    const query = OPS.updateContact(this);
    this.log('generated query:');
    this.log(query);
    const results = await this.db.update(query).promise();
    this.log(`updated results: ${results}`);
    return results;
  }

  async delete() {
    this.log('manually flushing contact...');
    await this.db.delete(OPS.deleteContact(this)).promise();
  }

  async load() {
    this.log('fetching contact from database...');
    let response;
    try {
      response = await this.db.get(OPS.getContact(this)).promise();
    } catch (e) {
      this.log('could not find contact! assuming its new...');
      return this;
    }
    const { Item } = response;
    if (!Item) {
      this.log('could not find contact! assumings its new...');
      return this;
    }
    this.log(`found existing contact:`);
    this.log(Item);
    const {
      // locale,
      entered_timestamp,
      priority,
      state,
      ttl,
      pdas,
      worksites,
      ids,
      agent_id,
      action,
    } = Item;
    if (!ttl > Math.floor(Date.now() / 1000)) {
      this.log('contact is expired! recreating!');
      await this.delete();
      if (state.includes(CONTACT_STATES.ROUTED)) {
        this.log('expired contact was routed... respecting!');
        this.state = state;
        this.cases = { pdas, worksites, ids };
        this.agent = agent_id || 'none';
        this.priority = priority;
        this.action = action;
        return this;
      }
      return this;
    }
    this.entered_timestamp = Date.parse(entered_timestamp);
    this.priority = priority;
    this.action = action;
    this.state = state;
    // this.locale = locale;

    this.cases = {
      pdas,
      worksites,
      ids,
    };
    return this;
  }
}
