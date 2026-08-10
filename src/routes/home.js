
// ✅ ES6 Imports
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { poolUser } from "../db/connection.js";

import cookieParser from "cookie-parser";

// ✅ For __dirname in ES6 modules
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);

// ✅ Initialize dotenv to load environment variables
dotenv.config();

// ✅ Create router
const router = express.Router();

// ✅ Apply global middlewares
router.use(cookieParser());
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));



// ✅ home route
router.get("/", async (req, res) => {
  // Dashboard stats: registered users, catalog entries, and requests

  const client = await poolUser.connect();
  const result = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'raster'");
  const result1 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'lulc'");
  const result2 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'lulcchange'");
  const result3 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'hotspots'");
  client.release();

  // Combine counts in one object
  result.rows[0].rastercount = result.rows[0].count;
  result.rows[0].lulccount = result1.rows[0].count;
  result.rows[0].lulcchange = result2.rows[0].count;
  result.rows[0].hotspotcount = result3.rows[0].count;

  const userItems = result.rows[0];


    // Render EJS template 'home'
  res.render("home", { userItems });
    // res.render("home");

});

//✅ Route:GET api to  get meta data iformation of a file
router.get("/metadata/:id", async (req, res) => {
  // console.log("router.get('/:id', async (req, res) ---> start");

  const id = req.params.id;
  // console.log(id);
  // res.render("catalogView")
  try {
    const client = await poolUser.connect();
    const result = await client.query(
      `SELECT * FROM catalog where file_name = $1`,
      [id]
    );
    const catalogItems = result.rows;
    catalogItems.forEach((item) => {
      if (item.uploaddate) {
        item.uploaddate = new Date(item.uploaddate).toLocaleString("en-IN"); // Format uploaddate here
      }
    });

    client.release();
    res.render("metadata", { catalogItems });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});






export default router;
