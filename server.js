import express from 'express';
import path from 'path';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import helmet from "helmet";

import router from './src/routes/index.js';
import adminAuthMiddleware from './src/middleware/adminAuth.js';
import cookieParser from 'cookie-parser';

// Setup for ES modules to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { tusServer } from "./src/tus/tiffTusServer.js";


// Load environment variables
dotenv.config();

const app = express();

// ✔ Security header
app.disable("x-powered-by");

// ✅ GLOBAL middleware FIRST (cookieParser only — bodyParser comes AFTER TUS)
app.use(cookieParser());

// ─────────────────────────────────────────────────────────────
// 🛡️ TUS UPLOAD ROUTES — MUST be before bodyParser
//    bodyParser.json() and urlencoded() consume the request stream.
//    @tus/server must receive the raw stream for chunk uploads to work.
// ─────────────────────────────────────────────────────────────

// WAF BYPASS: restores TUS Content-Type that the frontend disguised as
// "application/octet-stream" for WAF compatibility.
// Two triggers to handle all cases:
//   1. Client sent application/octet-stream  → our WAF bypass transform
//   2. X-HTTP-Method-Override: PATCH present → this IS a TUS chunk, force it
function restoreTusContentType(req, _res, next) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  const methodOverride = (req.headers['x-http-method-override'] || '').toUpperCase();
  const isTusChunk = methodOverride === 'PATCH';
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
  // 🔍 DIAGNOSTIC: log every TUS request+response so we can see
  //    if 403 comes from Express/TUS (log appears) or from WAF (no log)
  res.on('finish', () => {
    console.log(
      `[TUS] ${req.method} ${req.path}` +
      ` | status=${res.statusCode}` +
      ` | override=${req.headers['x-http-method-override'] || '-'}` +
      ` | ct=${req.headers['content-type'] || '-'}` +
      ` | cookie=${req.cookies?.token ? 'present' : 'MISSING'}`
    );
  });
  tusServer.handle(req, res);
}

app.all("/admin/tiffuploads", adminAuthMiddleware, restoreTusContentType, handleTus);
app.all("/admin/tiffuploads/*", adminAuthMiddleware, restoreTusContentType, handleTus);


// ─────────────────────────────────────────────────────────────
// Body parsers for all other routes (after TUS so they don't
// interfere with the TUS raw stream)
// ─────────────────────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));



// 🔐 Serve protected folder only if authenticated
app.use('/admin-assets', adminAuthMiddleware, express.static(path.join(__dirname, 'admin-assets')));


const cspOptions = {
  useDefaults: true,
  directives: {
    defaultSrc: ["'self'"],

    scriptSrc: [
      "'self'",
      "https://cdn.jsdelivr.net",
      "https://cdnjs.cloudflare.com",
      "https://challenges.cloudflare.com",
      "https://www.youtube.com",
      "https://s.ytimg.com",
      "https://unpkg.com"
    ],

    styleSrc: [
      "'self'",
      "'unsafe-inline'",
      "https://fonts.googleapis.com",
      "https://cdn.jsdelivr.net",
      "https://cdnjs.cloudflare.com"
    ],

    fontSrc: [
      "'self'",
      "https://fonts.gstatic.com",
      "https://cdn.jsdelivr.net",
      "https://cdnjs.cloudflare.com"
    ],

    imgSrc: [
      "'self'",
      "data:",
      "https://i.ytimg.com",
      "https://s.ytimg.com",
      "https://www.google.com",
      "https:"
    ],

    frameSrc: [
      "'self'",
      "https://www.youtube.com",
      "https://www.youtube-nocookie.com",
      "https://challenges.cloudflare.com",
      "https://www.google.com"
    ],

    connectSrc: [
      "'self'",
      "https://cdn.jsdelivr.net",
      "https://cdnjs.cloudflare.com",
      "https://www.youtube.com",
      "https://cdnjs.cloudflare.com",
      "https://unpkg.com"
    ],

    objectSrc: ["'none'"],
    //    upgradeInsecureRequests: [],
  },
};


app.use(helmet.contentSecurityPolicy(cspOptions));

// JWT Middleware
const jwtMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) {
    jwt.verify(token, process.env.adminSecretKey, (err, decoded) => {
      if (err) {
        return res.status(401).send('Unauthorized');
      }
      req.user = decoded;
      next();
    });
  } else {
    next();
  }
};
app.use(jwtMiddleware);

// ✅ View engine setup for EJS
const viewpath = path.join(__dirname, 'templates/views');
app.set('view engine', 'ejs');
app.set('views', viewpath);

// Routes
app.use('/', router);

// Start the server
const PORT = process.env.PORT || 4100;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`[${HOST}]:${PORT} listening on port ${PORT}`);
});
