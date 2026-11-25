import { startLocalApiServer } from './local-server.js';

void startLocalApiServer({
  localDevMode: process.env['LOCAL_DEV_MODE'] !== 'false',
}).then(({ url }) => {
  console.log(`Financial SaaS local API listening on ${url}`);
});
