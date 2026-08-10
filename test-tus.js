import express from 'express';
import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import http from 'http';

const app = express();
const tusServer = new Server({
    path: '/admin/tiffuploads',
    datastore: new FileStore({ directory: './temp' }),
});

app.all('/admin/tiffuploads', (req, res) => {
    tusServer.handle(req, res);
});
app.all('/admin/tiffuploads/*', (req, res) => {
    tusServer.handle(req, res);
});

const server = http.createServer(app);
server.listen(4101, async () => {
    console.log('Server started on 4101');

    const fetch = (await import('node-fetch')).default;

    // Test 1: POST /admin/tiffuploads
    const res1 = await fetch('http://localhost:4101/admin/tiffuploads', { method: 'POST', redirect: 'manual' });
    console.log('POST /admin/tiffuploads ->', res1.status, res1.headers.get('location'));

    // Test 2: POST /admin/tiffuploads/
    const res2 = await fetch('http://localhost:4101/admin/tiffuploads/', { method: 'POST', redirect: 'manual' });
    console.log('POST /admin/tiffuploads/ ->', res2.status, res2.headers.get('location'));

    process.exit(0);
});
