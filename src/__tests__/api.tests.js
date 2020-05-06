/**
 * api.tests.js
 * Api Module Tests
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { advanceTo, clear } from 'jest-date-mock';
import { Agent, Contact, Events, Helpers, Outbound } from '../api';
import { Dynamo } from '../utils';

jest.mock('../utils/dynamo.js');
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
    const cases = await Outbound.resolveCasesByNumber('+1234567890');
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

  it('sets agent state', () => {
    const mockDb = jest.fn();
    Dynamo.DynamoTable = jest.fn().mockImplementation(() => ({
      putItem: jest.fn().mockImplementation(() => ({
        promise: mockDb,
      })),
    }));
    Agent.setState({
      agentId: 'xxxx',
      agentState: Agent.AGENT_STATES.ROUTABLE,
      last_contact_id: 'abc123',
      current_contact_id: '123abc',
      connection_id: 'zzzz',
    });
    expect(Dynamo.DynamoTable).toMatchSnapshot();
    expect(mockDb.mock).toMatchSnapshot();
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
  it('sets correct contact state', () => {
    const contact = new Contact.Contact({ contactId: 'xxxx' });
    expect(contact.state).toBe('en_US#queued');
    expect(contact.routed).toBe(false);
    contact.setState('en_US#routed');
    expect(contact.state).toBe('en_US#routed');
    expect(contact.routed).toBe(true);
    contact.setState('queued');
    expect(contact.state).toBe('en_US#queued');
    contact.setState('es_MX#routed');
    expect(contact.state).toBe('es_MX#routed');
  });

  it('generates the correct operations', () => {
    advanceTo(new Date(2020, 5, 20, 0, 0, 0, 0));
    const updateOp = Contact.OPERATIONS.updateContact({
      contactId: 'xxxx',
      state: 'somestate',
      priority: 1,
    });
    const queryNumOp = Contact.OPERATIONS.queryNumByState({ state: 'routed' });

    expect(updateOp).toMatchSnapshot();
    expect(queryNumOp).toMatchSnapshot();
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
