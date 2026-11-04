import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  commonsResponse,
  makeMidi,
  makePdf,
  MUTOPIA_NO_MATCHES,
  mutopiaListing,
  PIANO_WALTZ,
} from '../../packages/fixtures/src/index.ts';

export const MUTOPIA_OP9_PATH =
  '/ftp/ChopinFF/O9/nocturne_in_b-flat_minor/nocturne_in_b-flat_minor';

export interface FindStub {
  origin: string;
  server: Server;
}

export async function startFindStub(): Promise<FindStub> {
  const calls: string[] = [];
  const pdf = Buffer.from(makePdf(['Nocturne page 1', 'Nocturne page 2']));
  const midi = Buffer.from(makeMidi(PIANO_WALTZ));
  let origin = '';

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    if (url.pathname === '/__calls') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(calls));
      return;
    }
    calls.push(`${url.pathname}${url.search}`);
    const send = (status: number, type: string, body: string | Buffer) => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };
    if (url.pathname === '/cgibin/make-table.cgi') {
      const q = (url.searchParams.get('searchingfor') ?? '').toLowerCase();
      if (q.includes('broken')) {
        send(500, 'text/plain', 'the stand-in site is down');
        return;
      }
      if (q.includes('zzzz')) {
        send(200, 'text/html', MUTOPIA_NO_MATCHES);
        return;
      }
      send(200, 'text/html', mutopiaListing(undefined, origin));
      return;
    }
    if (url.pathname === '/w/api.php') {
      const q = (url.searchParams.get('gsrsearch') ?? '').toLowerCase();
      if (q.includes('zzzz')) {
        send(200, 'application/json', '{"batchcomplete":true}');
        return;
      }
      send(200, 'application/json', commonsResponse(origin));
      return;
    }
    if (url.pathname.startsWith('/ftp/') && url.pathname.endsWith('.pdf')) {
      send(200, 'application/pdf', pdf);
      return;
    }
    if (url.pathname.startsWith('/ftp/') && url.pathname.endsWith('.mid')) {
      send(200, 'audio/sp-midi', midi);
      return;
    }
    if (url.pathname.startsWith('/wikipedia/commons/') && url.pathname.endsWith('.pdf')) {
      send(200, 'application/pdf', pdf);
      return;
    }
    send(404, 'text/plain', 'not on the stand-in');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return { origin, server };
}
