/**
 * contact.js
 * Contact Module
 */

import { Dynamo } from '../../utils';
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

export class Contact {
  constructor(params) {
    const { contactId, contactRouted, contactLocale } = params;
    this.contactId = contactId;
    this.db = Dynamo.DynamoClient(Dynamo.TABLES.CONTACTS);
    this.locale = contactLocale || CONTACT_LANG.en_US;
    this.routed = contactRouted || false;
    this.priority = 0;
  }

  log(message) {
    const title = `contact[${this.contactId}|${this.state}]`;
    console.log(`${title} ${message}`);
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
        routed ? CONTACT_STATES.ROUTED : CONTACT_STATES.QUEUED
      }`,
    );
    this.locale = CONTACT_LANG[localeValue];
    this.routed = routed;
    return this.state;
  }

  async setState(newState) {
    this.state = newState;
    const results = await this.db.update(OPS.updateContact(this)).promise();
    this.log(`updated results: ${results}`);
    return results;
  }
}
