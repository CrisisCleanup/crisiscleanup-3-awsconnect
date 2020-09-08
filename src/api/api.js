/**
 * api.js
 * Base Api Module
 */

import { Dynamo } from '../utils';

export default class ApiModel {

  constructor({ loggerName = '', dbTable } = {}) {
    this.loggerName = loggerName;
    this.dbTable = dbTable.name;
    if (dbTable) {
      this.db = Dynamo.DynamoClient(dbTable);
    }
  }

  log(message, ...params) {
    console.log(`${this.loggerName} `, message, ...params);
    return this;
  }

}
