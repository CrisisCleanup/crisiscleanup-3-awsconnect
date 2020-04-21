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
  constructor({ itemId }) {
    this.eventItem = {
      object_id: itemId,
      attr: { __source: 'awsconnect' },
    };
    this.eventDef = {
      action: null,
      object: null,
    };
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
    const { object, action } = this.eventDef;
    return `${action}_${object}`;
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

  async save(attrs = {}) {
    this.eventItem.event_key = this.eventKey;
    this.eventItem.attr = { ...this.eventItem.attr, ...attrs };
    await axios.post('/event_logs', this.eventItem);
  }
}
