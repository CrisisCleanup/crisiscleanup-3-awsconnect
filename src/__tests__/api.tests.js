/**
 * api.tests.js
 * Api Module Tests
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { advanceTo, clear } from 'jest-date-mock';
import { Agent, Contact, Events, Helpers, Outbound } from '../api';

// jest.mock('../utils/dynamo.js');
jest.mock('../ws');

const MockOutbound = ({ id, phoneNumber, pda, worksite } = {}) => ({
  id: id || 0,
  phone_number: phoneNumber || '+1234567890',
  pda: pda || null,
  worksite: worksite || null,
  external_id: '123abc',
  external_platform: 'connect',
});

describe('outbound api', () => {
  it('retrieves outbound by number', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', {
        params: { phone_number: '1234567890' },
      })
      .reply(200, {
        results: [MockOutbound()],
      });

    const resp = await Outbound.getByPhoneNumber('+1234567890');
    expect(resp).toMatchSnapshot();
  });

  it('throws error on no results', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', {
        params: { phone_number: '1234567890' },
      })
      .reply(404, {
        results: [],
      });
    await expect(Outbound.getByPhoneNumber('123')).rejects.toThrow();
  });

  it('resolves cases by number', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', { params: { phone_number: '1234567890' } })
      .reply(200, {
        results: [
          MockOutbound(),
          MockOutbound({ id: 1, worksite: 1 }),
          MockOutbound({ id: 3, pda: 1 }),
        ],
      });
    mock
      .onGet('/worksites', {
        params: { phone_number: '1234567890', incident: 199 },
      })
      .reply(200, {
        results: [{ id: 99 }],
      });
    const cases = await Outbound.resolveCasesByNumber('+1234567890', 199);
    expect(cases).toMatchSnapshot();
  });

  it('creates callback', async () => {
    const mock = new MockAdapter(axios);
    mock.onGet('/languages').reply(200, {
      results: [
        {
          id: 5,
          subtag: 'en-US',
        },
      ],
    });
    mock
      .onPost('/phone_outbound', {
        dnis1: '+10000000000',
        call_type: 'callback',
        language: 5,
        incident_id: ['199'],
        external_id: '123abc',
        external_platform: 'connect',
      })
      .reply(201);
    const resp = await Outbound.create(
      '+10000000000',
      'en_US',
      '199',
      '123abc',
    );
    expect(resp).toMatchSnapshot();
  });

  it('unlocks the latest callback', async () => {
    const mock = new MockAdapter(axios);
    mock
      .onGet('/phone_outbound', { params: { phone_number: '10001112222' } })
      .reply(200, {
        results: [MockOutbound(), MockOutbound({ id: 99 })],
      });
    mock.onPost('/phone_outbound/99/unlock').reply(200);
    const resp = await Outbound.unlock('+10001112222');
    expect(resp).toMatchSnapshot();
  });

  it('gets the language id', async () => {
    const mock = new MockAdapter(axios);
    mock.onGet('/languages').reply(200, {
      results: [
        {
          id: 5,
          subtag: 'en-US',
        },
      ],
    });

    const result = await Helpers.getLanguageId('en_US');
    expect(result).toBe(5);
    const defaultResult = await Helpers.getLanguageId('abc');
    expect(defaultResult).toBe(2);
  });
});

describe('agent api', () => {
  it('generates valid keymaps', () => {
    const keyMap = Agent.KeyMap({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
    });
    expect(keyMap).toMatchSnapshot();
    const itemKeyMap = Agent.KeyMap({
      mapName: 'Item',
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ON_CALL,
      attributes: {
        contactId: 'yyyy',
      },
    });
    expect(itemKeyMap).toMatchSnapshot();
  });

  it('sets agent state', async () => {
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
      connection_id: 'zzzz',
    });
    const dbItem = await Agent.get({ agentId: 'xxxx' });
    expect(dbItem).toMatchInlineSnapshot(`
      Object {
        "active": "y",
        "connection_id": "zzzz",
        "entered_timestamp": "2020-06-20T05:00:00.000Z",
        "state": "online#routable#routable",
      }
    `);
    advanceTo(new Date(2020, 5, 20, 1, 0, 0, 0));
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.OFFLINE,
    });
    const offlineItem = await Agent.get({ agentId: 'xxxx' });
    expect(offlineItem).toMatchInlineSnapshot(`
      Object {
        "active": "y",
        "connection_id": "zzzz",
        "entered_timestamp": "2020-06-20T06:00:00.000Z",
        "state": "offline#not_routable#offline",
      }
    `);
    clear();
  });

  it('finds next agent for contact', async () => {
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
    });
    await Agent.setState({
      agentId: 'yyyy',
      agentState: Agent.AGENT_STATES.OFFLINE,
    });
    const nextAgent = await Agent.findNextAgent();
    expect(nextAgent.agent_id).toBe('xxxx');
    clear();
  });

  it('handles online but all non-routable agents', async () => {
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.PAUSED,
    });
    await Agent.setState({
      agentId: 'yyyy',
      agentState: Agent.AGENT_STATES.PAUSED,
    });
    const nextAgent = await Agent.findNextAgent();
    expect(nextAgent).toBeFalsy();
    clear();
  });

  it('handles no online agents', async () => {
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.OFFLINE,
    });
    await Agent.setState({
      agentId: 'yyyy',
      agentState: Agent.AGENT_STATES.OFFLINE,
    });
    await expect(Agent.findNextAgent()).rejects.toThrow(Agent.AgentError);
    clear();
  });

  it('correctly finds the longest routable agent', async () => {
    advanceTo(new Date(2019, 5, 20, 0, 0, 0, 0));
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
    });
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    await Agent.setState({
      agentId: 'yyyy',
      agentState: Agent.AGENT_STATES.ROUTABLE,
    });
    const nextAgent = await Agent.findNextAgent();
    expect(nextAgent.agent_id).toBe('xxxx');
    clear();
  });

  it('sustains contact id', async () => {
    advanceTo(new Date(2019, 5, 20, 0, 0, 0, 0));
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
    });
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.PENDING_CALL,
      current_contact_id: 'abc',
    });
    let agentItem = await Agent.get({ agentId: 'xxxx' });
    expect(agentItem).toMatchInlineSnapshot(`
      Object {
        "active": "y",
        "connection_id": "zzzz",
        "current_contact_id": "abc",
        "entered_timestamp": "2019-06-20T05:00:00.000Z",
        "state": "online#not_routable#PendingBusy",
      }
    `);
    await Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.BUSY,
    });
    agentItem = await Agent.get({ agentId: 'xxxx' });
    expect(agentItem).toMatchInlineSnapshot(`
      Object {
        "active": "y",
        "connection_id": "zzzz",
        "current_contact_id": "abc",
        "entered_timestamp": "2019-06-20T05:00:00.000Z",
        "state": "online#not_routable#Busy",
      }
    `);
    clear();
  });

  it('gets the correct state def', () => {
    const routeState = Agent.getStateDef(Agent.AGENT_STATES.ROUTABLE);
    expect(routeState).toStrictEqual(['online', 'routable', 'routable']);

    expect(Agent.getStateDef('offline')).toStrictEqual([
      'offline',
      'not_routable',
      'offline',
    ]);
    expect(Agent.getStateDef(Agent.AGENT_STATES.NOT_ROUTABLE)).toStrictEqual([
      'online',
      'not_routable',
      'not_routable',
    ]);
    expect(Agent.getStateDef(Agent.AGENT_STATES.PAUSED)).toStrictEqual([
      'online',
      'not_routable',
      'AfterCallWork',
    ]);
    expect(Agent.getStateDef(Agent.AGENT_STATES.AGENT_CALLING)).toStrictEqual([
      'online',
      'not_routable',
      'CallingCustomer',
    ]);
    expect(Agent.getStateDef(undefined)).toStrictEqual([
      'offline',
      'not_routable',
      'offline',
    ]);
  });
});

describe('contact api', () => {
  it('sets correct contact state', async () => {
    const contact = new Contact.Contact({ contactId: 'xxxx' });
    expect(contact.state).toBe('en_US#queued');
    expect(contact.routed).toBe(false);
    await contact.setState('en_US#routed');
    expect(contact.state).toBe('en_US#routed');
    expect(contact.routed).toBe(true);
    await contact.setState('queued');
    expect(contact.state).toBe('en_US#queued');
    await contact.setState('es_MX#routed');
    expect(contact.state).toBe('es_MX#routed');
  });

  it('generates the correct operations', () => {
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    const updateOp = Contact.OPERATIONS.updateContact({
      contactId: 'xxxx',
      state: 'somestate',
      priority: 1,
      cases: {},
    });
    const queryNumOp = Contact.OPERATIONS.queryNumByState({ state: 'routed' });

    expect(updateOp).toMatchSnapshot();
    expect(queryNumOp).toMatchSnapshot();
    clear();
  });

  it('adjusts state based on action', async () => {
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    let contact = await new Contact.Contact({ contactId: 'abc' }).load();
    await contact.delete();
    contact = await new Contact.Contact({ contactId: 'abc' }).load();
    contact.action = Contact.CONTACT_ACTIONS.ENTER;
    contact.routed = false;
    await contact.setState(Contact.CONTACT_STATES.QUEUED);
    expect(contact).toMatchSnapshot({ db: expect.anything() });
    contact.action = Contact.CONTACT_ACTIONS.CONNECTING;
    expect(contact.routed).toBe(true);
    await contact.setState();
    expect(contact.routed).toBe(true);
    expect(contact).toMatchSnapshot({ db: expect.anything() });
    expect(contact.state).toBe('en_US#routed');
    clear();
  });
});

describe('events api', () => {
  it('creates expected event key', () => {
    const event = new Events.Event({ itemId: 'xxxx' });
    event.object(Events.EVENT_OBJECTS.AGENT).update();
    expect(event.eventKey).toBe('update_agent');
    const callEvent = new Events.Event({ itemId: 'call_xxxx' })
      .object(Events.EVENT_OBJECTS.INBOUND)
      .join(event);
    expect(callEvent.eventKey).toBe('join_inbound-call_to_agent');
  });
});
