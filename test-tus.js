import express from 'express';
import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import http from 'http';

const app = express();
const tusServer = new Server({
    path: '/admin/tiffuploads',
    datastore: new FileStore({ directory: './temp' }),
});

function restoreTusContentType(req, _res, next) {
  // Helper to robustly read header values, resolving potential comma-separated duplicates
  const getHeader = (name) => {
    const val = req.headers[name.toLowerCase()];
    if (Array.isArray(val)) return val[0];
    if (typeof val === 'string' && val.includes(',')) return val.split(',')[0].trim();
    return val;
  };

  const ct = (getHeader('content-type') || '').toLowerCase();
  const methodOverride = (getHeader('x-http-method-override') || '').toUpperCase();
  const tusResumable = getHeader('tus-resumable');
  const uploadOffset = getHeader('upload-offset');

  // Rewrite normalized values back to request headers so @tus/server sees clean values
  if (tusResumable) {
    req.headers['tus-resumable'] = tusResumable;
  }
  if (uploadOffset !== undefined) {
    req.headers['upload-offset'] = uploadOffset;
  }
  if (methodOverride) {
    req.headers['x-http-method-override'] = methodOverride;
  }

  // A request is a TUS chunk if it's explicitly overridden as PATCH,
  // OR if it's a POST request that contains the upload-offset header.
  const isTusChunk = methodOverride === 'PATCH' || (req.method === 'POST' && uploadOffset !== undefined);
  const isWafDisguised = ct.startsWith('application/octet-stream');

  // Actually apply the METHOD OVERRIDE for @tus/server
  // Modern @tus/server v2+ delegates HTTP method resolution to Express.
  if (isTusChunk) {
    req.method = 'PATCH';
  }

  const needsFix = isWafDisguised || (isTusChunk && !ct.startsWith('application/offset+octet-stream'));

  if (needsFix) {
    req.headers['content-type'] = 'application/offset+octet-stream';
    console.log(`[TUS] Content-Type restored: "${ct}" → application/offset+octet-stream`);
  }
  next();
}

function handleTus(req, res) {
  res.on('finish', () => {
    console.log(
      `[TUS] ${req.method} ${req.path} | status=${res.statusCode} | tus-resumable=${req.headers['tus-resumable']} | upload-offset=${req.headers['upload-offset']}`
    );
  });
  tusServer.handle(req, res);
}

app.all('/admin/tiffuploads', restoreTusContentType, handleTus);
app.all('/admin/tiffuploads/*', restoreTusContentType, handleTus);

const server = http.createServer(app);
server.listen(4101, async () => {
    console.log('Server started on 4101');

    // 1. Create a dummy upload
    const resCreate = await fetch('http://localhost:4101/admin/tiffuploads', {
        method: 'POST',
        headers: {
            'Tus-Resumable': '1.0.0',
            'Upload-Length': '10',
            'Upload-Metadata': 'file_name cmFzdGVyX2ZpbGU=,theme cmFzdGVy',
        }
    });
    
    console.log('Create Status:', resCreate.status);
    const location = resCreate.headers.get('location');
    console.log('Location:', location);

    if (!location) {
        process.exit(1);
    }

    // 2. Perform POST request with duplicated header values simulating Nginx proxying
    const resUpload = await fetch(location, {
        method: 'POST',
        headers: {
            'Tus-Resumable': '1.0.0, 1.0.0', // simulates duplicate headers joined by a comma
            'Upload-Offset': '0, 0',         // simulates duplicate headers joined by a comma
            'Content-Type': 'application/octet-stream',
        },
        body: 'hello'
    });

    console.log('Upload Status:', resUpload.status);
    console.log('Upload Content-Type:', resUpload.headers.get('content-type'));
    console.log('Upload Content-Length:', resUpload.headers.get('content-length'));
    console.log('Upload Response Text:', await resUpload.text());

    process.exit(0);
});
