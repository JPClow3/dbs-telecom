import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './app.js';

// Cloudflare's Node compatibility layer exposes an HTTP bridge for Express.
// The app listens only inside the Worker isolate; no TCP port is opened.
const app = createApp();
app.listen(3000);

export default httpServerHandler({ port: 3000 });
