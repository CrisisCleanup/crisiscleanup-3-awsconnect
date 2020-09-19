/**
 * main.tests.js
 * Main Tests
 */

import { Agent, Outbound } from '../api';
import Handler from '../index';

jest.mock('../ws');

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
  },
});

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
    Agent.setState = jest.fn();
    Agent.get = jest.fn(() => getParams);
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
    await setState(params);
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
  it('correctly sets agent state for existing agent', async () => {
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
    await setState(params, existing);
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
});
