/**
 * api.tests.js
 * Api Module Tests
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { Outbound } from '../api';

const MockOutbound = ({ id, phoneNumber, pda, worksite } = {}) => ({
  id: id || 0,
  phone_number: phoneNumber || '+1234567890',
  pda: pda || null,
  worksite: worksite || null,
});

describe('api', () => {
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
});
