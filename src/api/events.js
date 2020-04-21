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
      object_id: itemId,
      attr: { __source: 'awsconnect' },
    };
    this.eventDef = {
      action: null,
      object: null,
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
    const { object, action, joined } = this.eventDef;
    if (action === 'join' && joined) {
      // eslint-disable-next-line no-underscore-dangle
      this.eventItem.attr.__joined_id = joined.recent;
      return `${action}_${object}_to_${joined.eventDef.object}`;
    }
    return `${action}_${object}`;
  }

  get recent() {
    if (!this.logObjs.length) {
      return null;
    }
    this.log('joining recent log object:', this.logObjs);
    return this.logObjs[this.logObjs.length - 1].id;
  }

  log(message) {
    const title = `event[${this.eventItem.object_id}|${this.eventKey}]`;
    console.log(`${title} ${message}`);
  }

  object(value) {
    console.log(`setting current object: ${value}`);
    this.eventDef.object = value;
    return this;
  }

  join(event) {
    console.log(`joining event to ${event}`);
    this.eventDef.action = 'join';
    this.eventDef.joined = event;
    return this;
  }

  async save(attrs = {}) {
    this.eventItem.event_key = this.eventKey;
    this.eventItem.attr = { ...this.eventItem.attr, ...attrs };
    const resp = await axios.post('/event_logs', this.eventItem);
    this.logObjs.push(resp.data);
    return this;
  }
}
