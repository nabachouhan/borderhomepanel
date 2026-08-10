// adminAuthMiddleware.js

// Import required modules
import jwt from 'jsonwebtoken';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

// Initialize Express app (optional here; normally done in server.js)
const app = express();
// ✔ This removes the header that reveals the server is running Express
app.disable("x-powered-by");

// Middleware to parse cookies
app.use(cookieParser());

// Middleware to parse incoming JSON and URL-encoded data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



// Admin authentication middleware
const adminAuthMiddleware = (req, res, next) => {
  // Let CORS Preflight (OPTIONS) requests pass through
  // so that components like tusServer can add protocol headers
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Read JWT token from cookies
  const token = req.cookies.token;
  // console.log("Checking token presence...");

  // Helper function to decode JWT payload (without verifying signature)
  function parseJwt(token) {
    try {
      return JSON.parse(atob(token.split('.')[1]));
    } catch (error) {
      console.error(error);

      return null;
    }
  }

  // If token is missing, redirect to login
  if (!token) {
    console.log("Token not found. Redirecting to login.");
    return res.redirect('/admin');
  }

  // Decode token to get expiration time
  const decodedToken = parseJwt(token);
  const currentTime = Math.floor(Date.now() / 1000); // current time in seconds

  // If decoding fails or token is expired, send error response
  if (!decodedToken || decodedToken.exp < currentTime) {
    return res.redirect('/admin?expired=true');
  }

  try {
    // Verify token signature using secret key
    const decoded = jwt.verify(token, process.env.adminSecretKey);

    // Attach user info to request for downstream use
    req.user = decoded;

    // Proceed to next middleware or route
    next();
  } catch (err) {
    // If token verification fails, redirect to login
    console.log("Token verification failed:", err);
    return res.redirect('/admin');
  }
};

// Export middleware function using ES6 syntax
export default adminAuthMiddleware;
