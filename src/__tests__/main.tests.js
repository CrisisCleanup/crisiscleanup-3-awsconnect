/**
 * main.tests.js
 * Main Tests
 */

import { Agent, Outbound, Metrics, Client } from '../api';
import { Dynamo } from '../utils';
import Handler, { agentStreamHandler } from '../index';
import { advanceTo, clear } from 'jest-date-mock';

jest.mock('../ws');
jest.mock('../utils/dynamo');
jest.mock('../api/agent/index.js');
jest.mock('../api/metrics/index.js');
jest.mock('../api/client/index.js');

const MockEvent = (data = {}) => ({
  Details: {
    Parameters: {
      inboundNumber: '+10000000000',
      isDev: '0',
      action: 'CHECK_CASE',
      userLanguage: 'en_US',
      incidentId: '199',
      ...data,
    },
    ContactData: {
      Attributes: {},
    },
    client: 'ws',
  },
});

const MockRecords = ({ eventName, newImage, oldImage } = {}) => [
  {
    eventName: eventName || 'MODIFY',
    dynamodb: {
      NewImage: newImage || { locale: 'en-US' },
      OldImage: oldImage || { locale: 'en-US' },
    },
  },
];

describe.skip('handler', () => {
  it('checks for existing case', async () => {
    Outbound.resolveCasesByNumber = jest.fn();
    Outbound.resolveCasesByNumber.mockResolvedValue({
      ids: [0, 1],
      pdas: [1],
      worksites: [2],
    });
    const callback = jest.fn();
    await Handler(MockEvent(), {}, callback);
    expect(Outbound.resolveCasesByNumber.mock.calls.length).toBe(1);
    expect(callback).toMatchSnapshot();
  });

  it('creates a new callback', async () => {
    Outbound.create = jest.fn();
    Outbound.create.mockResolvedValue({
      status: 200,
    });
    const callback = jest.fn();
    await Handler(MockEvent({ action: 'CALLBACK' }), {}, callback);
    expect(Outbound.create.mock.calls.length).toBe(1);
    expect(callback).toMatchSnapshot();
  });

  it('denies a callback', async () => {
    Outbound.unlock = jest.fn();
    Outbound.unlock.mockResolvedValue({
      status: 200,
    });
    const callback = jest.fn();
    await Handler(MockEvent({ action: 'DENIED_CALLBACK' }), {}, callback);
    expect(Outbound.unlock.mock.calls.length).toBe(1);
    expect(callback).toMatchSnapshot();
  });

  it('sets agent state', async () => {
    Agent.setState = jest.fn();
    const callback = jest.fn();
    const params = {
      action: 'SET_AGENT_STATE',
      agentId: 'xxxx',
      agentState: 'routable',
    };
    await Handler(
      MockEvent({ action: 'SET_AGENT_STATE', ...params }),
      {},
      callback,
    );
    expect(Agent.setState).toMatchSnapshot();
    expect(callback).toMatchSnapshot();
  });
});

describe('SET_AGENT_STATE', () => {
  const setState = async (params, getParams = null) => {
    Agent.createStateWSPayload.mockReturnValue({ meta: { connectionId: '' } });
    Agent.get.mockResolvedValue(getParams);
    const callback = jest.fn();
    await Handler(
      MockEvent({ action: 'SET_AGENT_STATE', ...params }),
      {},
      callback,
    );
  };

  it('correctly sets agent state for new agent', async () => {
    const params = {
      agentId: 'xxxx',
      contactState: 'routable',
      routeState: 'routable',
      state: 'online',
      locale: 'en-US',
    };
    Agent.getStateDef.mockReturnValue('online#routable#routable'.split('#'));
    await setState(params);
    expect(Agent.setState.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "agentId": "xxxx",
          "agentState": "online#routable#routable",
          "connection_id": null,
          "current_contact_id": null,
          "locale": "en-US",
        },
      ]
    `);
  });
  it('correctly resolves contact state for new agent', async () => {
    const params = {
      agentId: 'xxxx',
      routeState: 'not_routable',
      state: 'offline',
      locale: 'en-US',
    };
    Agent.getStateDef
      .mockReturnValueOnce('offline#not_routable#not_routable'.split('#'))
      .mockReturnValueOnce('offline#not_routable#not_routable'.split('#'));
    await setState(params, 'offline#not_routable');
    expect(Agent.setState.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "agentId": "xxxx",
          "agentState": "offline#not_routable#not_routable",
          "connection_id": null,
          "current_contact_id": null,
          "locale": "en-US",
        },
      ]
    `);
  });
  it('correctly resolves full state for new agent', async () => {
    const params = {
      agentId: 'xxxx',
      agentState: 'online#routable#routable',
      locale: 'en-US',
    };
    await setState(params, 'online#routable#routable');
    expect(Agent.setState.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "agentId": "xxxx",
          "agentState": "online#routable#routable",
          "connection_id": null,
          "current_contact_id": null,
          "locale": "en-US",
        },
      ]
    `);
  });
  it('correctly sets agent state for existing agent w/o contact state', async () => {
    const params = {
      agentId: 'xxxx',
      routeState: 'not_routable',
      state: 'online',
      locale: 'en-US',
    };
    const existing = {
      agent_id: 'xxxx',
      state: 'online#not_routable#PendingBusy',
    };
    Agent.getStateDef
      .mockReturnValueOnce('online#not_routable#not_routable'.split('#'))
      .mockReturnValueOnce('online#not_routable#PendingBusy'.split('#'));
    await setState(params, '', existing);
    expect(Agent.setState.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "agentId": "xxxx",
          "agentState": "online#not_routable#PendingBusy",
          "connection_id": null,
          "current_contact_id": null,
          "locale": "en-US",
        },
      ]
    `);
  });
  it('correctly sets agent state from only new contact state', async () => {
    const params = {
      agentId: 'xxxx',
      agentState: 'PendingBusy',
    };
    const existing = {
      agent_id: 'xxxx',
      state: 'online#not_routable#pending',
    };
    await setState(params, existing);
    expect(Agent.setState.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        Object {
          "agentId": "xxxx",
          "agentState": "PendingBusy",
          "connection_id": null,
          "current_contact_id": null,
          "locale": undefined,
        },
      ]
    `);
  });
  it('correctly handles outbound call state and expiration', async () => {
    clear();
    advanceTo(new Date(2019, 5, 20, 0, 0, 0, 0));
    Agent.getStateDef
      .mockReturnValueOnce('online#not_routable#CallingCustomer'.split('#'))
      .mockReturnValueOnce('online#not_routable#CallingCustomer'.split('#'))
      .mockReturnValueOnce('online#not_routable#CallingCustomer'.split('#'))
      .mockReturnValueOnce('offline#not_routable#not_routable'.split('#'));
    const clientSendMock = jest.fn();
    const clientMock = {
      send() {
        return clientSendMock;
      },
    };
    Client.Client.mockReturnValue({
      load() {
        return clientMock;
      },
    });
    let params = {
      agentId: 'xxxx',
      contactState: 'CallingCustomer',
      routeState: 'not_routable',
      state: 'online',
      currentContactId: 'xxxx#yyyy',
    };
    let existing = {
      agent_id: 'xxxx',
      state: 'online#routable#routable',
      connection_id: 'abc123',
    };
    await setState(params, existing);
    params = {
      agentId: 'xxxx',
      contactState: 'CallingCustomer',
      routeState: 'not_routable',
      state: 'online',
      currentContactId: 'xxxx#yyyy',
    };
    existing = {
      agent_id: 'xxxx',
      state: 'online#not_routable#CallingCustomer',
      state_ttl: Math.floor(Date.now() / 1000) + 70 * 3,
      current_contact_id: 'xxxx#yyyy',
      connection_id: 'abc123',
    };
    advanceTo(new Date(2019, 5, 20, 0, 0, 10, 0));
    // only 10 seconds passed, agent should retain contact
    await setState(params, existing);
    advanceTo(new Date(2019, 5, 20, 0, 4, 0, 0));
    // 2 minutes have passed, agent should release contact
    await setState(params, existing);
    expect(Agent.setState.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "agentId": "xxxx",
            "agentState": "online#not_routable#CallingCustomer",
            "connection_id": null,
            "current_contact_id": "xxxx#yyyy",
            "locale": undefined,
            "state_ttl": 1560989010,
          },
        ],
        Array [
          Object {
            "agentId": "xxxx",
            "agentState": "online#not_routable#CallingCustomer",
            "connection_id": null,
            "current_contact_id": "xxxx#yyyy",
            "locale": undefined,
          },
        ],
        Array [
          Object {
            "agentId": "xxxx",
            "agentState": "offline#not_routable#not_routable",
            "connection_id": null,
            "current_contact_id": null,
            "locale": undefined,
          },
        ],
      ]
    `);
    expect(clientSendMock.mock.calls).toMatchInlineSnapshot(`Array []`);
    clear();
  });
});

describe('agentStreamHandler', () => {
  const runEvent = async (records = null) => {
    const event = MockEvent();
    event.Records = records || MockRecords();
    Dynamo.normalize = jest.fn((val) => val);
    Client.Client.all.mockResolvedValue([]);

    await agentStreamHandler(event);
    return Metrics.Metrics.mock.instances[0];
  };

  it('correctly handles agent going offline', async () => {
    Agent.isOnline.mockReturnValueOnce(true).mockReturnValueOnce(false);
    Agent.isRoutable.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const metric = await runEvent();
    expect(metric.increment.mock.calls).toMatchInlineSnapshot(`Array []`);
    expect(metric.decrement.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "AGENTS_ONLINE",
          1,
          "en-US",
        ],
        Array [
          "AGENTS_AVAILABLE",
          1,
          "en-US",
        ],
      ]
    `);
  });

  it('correctly handles agent going online', async () => {
    Agent.isOnline.mockReturnValueOnce(false).mockReturnValueOnce(true);
    Agent.isRoutable.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const metric = await runEvent();
    expect(metric.increment.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "AGENTS_ONLINE",
          1,
          "en-US",
        ],
        Array [
          "AGENTS_AVAILABLE",
          1,
          "en-US",
        ],
      ]
    `);
    expect(metric.decrement.mock.calls).toMatchInlineSnapshot(`Array []`);
  });
  it('correctly handles online agent going not_routable', async () => {
    Agent.isOnline.mockReturnValueOnce(true).mockReturnValueOnce(true);
    Agent.isRoutable.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const metric = await runEvent();
    expect(metric.increment.mock.calls).toMatchInlineSnapshot(`Array []`);
    expect(metric.decrement.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "AGENTS_AVAILABLE",
          1,
          "en-US",
        ],
      ]
    `);
  });

  it('correctly handles agents on call', async () => {
    Agent.isOnline.mockReturnValue(true);
    Agent.isRoutable.mockReturnValue(true);

    const metric = await runEvent([
      ...MockRecords({ newImage: { current_contact_id: '', locale: 'en-US' } }),
    ]);
    expect(metric.increment.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "AGENTS_ON_CALL",
          1,
          "en-US",
        ],
      ]
    `);
    expect(metric.decrement.mock.calls).toMatchInlineSnapshot(`Array []`);
  });

  it('correctly handles new agents', async () => {
    Agent.isOnline.mockReturnValueOnce(true);
    Agent.isRoutable.mockReturnValueOnce(true);
    const records = MockRecords({ oldImage: null });
    records[0].dynamodb = { NewImage: { locale: 'en-US' } };

    const metric = await runEvent(records);
    expect(metric.increment.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "AGENTS_ONLINE",
          1,
          "en-US",
        ],
        Array [
          "AGENTS_AVAILABLE",
          1,
          "en-US",
        ],
      ]
    `);
    expect(metric.decrement.mock.calls).toMatchInlineSnapshot(`Array []`);
  });

  it('correctly cancels out online+offline agent', async () => {
    Agent.isOnline
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    Agent.isRoutable
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const metric = await runEvent([...MockRecords(), ...MockRecords()]);
    expect(metric.increment.mock.calls).toMatchInlineSnapshot(`Array []`);
    expect(metric.decrement.mock.calls).toMatchInlineSnapshot(`Array []`);
  });

  it('correctly handles multiple locales', async () => {
    // 2 Agents online, 1 offline === yield 1 agent online+routable
    Agent.isOnline
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true) // agent1 off -> on
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true) // agent2 off -> on
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false) // agent3 on -> off
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false) // agent4 (MX) online -> offline
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false) // agent5 (MX) online -> offline
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true); // agent6 (MX) online -> online

    Agent.isRoutable
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true) // agent1 notr -> r
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true) // agent2 notr -> r
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false) // agent3 r -> notr
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false) // agent4 (MX) r -> notr
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false) // agent5 (MX) r -> notr
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false); // agent6 (MX) notr -> notr

    const metric = await runEvent([
      ...MockRecords({ newImage: { current_contact_id: '', locale: 'en-US' } }), // US going online and on phone
      ...MockRecords({ newImage: { locale: 'en-US' } }), // US going online
      ...MockRecords({ newImage: { locale: 'en-US' } }), // US going offline
      ...MockRecords({ newImage: { locale: 'es-MX' } }), // MX going offline
      ...MockRecords({ newImage: { locale: 'es-MX' } }), // MX going offline
      ...MockRecords({ newImage: { locale: 'es-MX', current_contact_id: '' } }), // MX going on call
    ]);
    expect(metric.increment.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "AGENTS_ONLINE",
          1,
          "en-US",
        ],
        Array [
          "AGENTS_AVAILABLE",
          1,
          "en-US",
        ],
        Array [
          "AGENTS_ON_CALL",
          1,
          "en-US",
        ],
        Array [
          "AGENTS_ON_CALL",
          1,
          "es-MX",
        ],
      ]
    `);
    expect(metric.decrement.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          "AGENTS_ONLINE",
          2,
          "es-MX",
        ],
        Array [
          "AGENTS_AVAILABLE",
          2,
          "es-MX",
        ],
      ]
    `);
  });
});
