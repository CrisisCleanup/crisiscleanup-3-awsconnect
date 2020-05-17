/**
 * events.js
 * Events Module
 */

import axios from 'axios';

export const EVENT_OBJECTS = Object.freeze({
  AGENT: 'agent',
  INBOUND: 'inbound-call',
  OUTBOUND: 'outbound-call',
});

export const EVENT_ACTIONS = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
});

export class Event {
  constructor({ itemId = null } = {}) {
    this.eventItem = {
      patient_id: itemId,
      attr: { __source: 'awsconnect' },
    };
    this.eventDef = {
      action: null,
      patient: null,
      joined: null,
    };
    this.logObjs = [];
    Object.keys(EVENT_ACTIONS).forEach((k) => {
      this[k.toLowerCase()] = () => {
        const action = EVENT_ACTIONS[k];
        this.log(`setting event action: ${action}`);
        this.eventDef.action = action;
        return this;
      };
    });
  }

  get eventKey() {
    const { patient, action, joined } = this.eventDef;
    if (action === 'join' && joined) {
      // eslint-disable-next-line no-underscore-dangle
      this.eventItem.attr.__joined_id = joined.recent;
      return `${action}_${patient}_to_${joined.eventDef.patient}`;
    }
    return `${action}_${patient}`;
  }

  get recent() {
    if (!this.logObjs.length) {
      return null;
    }
    this.log('joining recent log object:', this.logObjs);
    return this.logObjs[this.logObjs.length - 1].id;
  }

  log(message) {
    const title = `event[${this.eventKey}]`;
    console.log(`${title} ${message}`);
  }

  object(value) {
    this.log(`setting current object: ${value}`);
    this.eventDef.patient = value;
    return this;
  }

  join(event) {
    this.log(`joining event to:`.event);
    this.eventDef.action = 'join';
    this.eventDef.joined = event;
    return this;
  }

  async save(attrs = {}) {
    this.eventItem.event_key = this.eventKey;
    this.eventItem.attr = { ...this.eventItem.attr, ...attrs };
    this.log('generating event:', this.eventItem);
    const resp = await axios.post('/event_logs', this.eventItem);
    this.logObjs.push(resp.data);
    return this;
  }
}
