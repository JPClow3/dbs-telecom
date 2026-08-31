import { httpServerHandler } from 'cloudflare:node';
import { createApp } from './app.js';

// Cloudflare's Node compatibility layer exposes an HTTP bridge for Express.
// A porta é configurável via PORT (padrão 3000); o bridge do Worker não abre
// socket TCP próprio, mas respeita a mesma configuração.
const port = Number(process.env.PORT || 3000);

const app = createApp();
app.listen(port);

export default httpServerHandler({ port });
