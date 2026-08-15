// adminRoutes.js (ES6 Module Version)

// ✅ Import modules using ES6 `import`
import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { poolUser, getPoolByTheme, administrativepl } from "../db/connection.js";
import multer from "multer";
import path from "path";
import adminAuthMiddleware from "../middleware/adminAuth.js";
import jwt from "jsonwebtoken";
import AdmZip from "adm-zip";
import axios from "axios";
import validator from "validator";
import fs from "fs";
import cookieParser from "cookie-parser";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { fileURLToPath } from "url";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { spawn } from "child_process";
import bcrypt from 'bcryptjs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Call dotenv.config() to load .env variables
dotenv.config();

// ✅ Create an Express Router
const router = express.Router();

// ✅ Middleware setup
router.use(cookieParser());
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));

// ✅ Email transport configuration using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.email_host,
  port: 587,
  secure: false, // STARTTLS
  requireTLS: true, // Optional but recommended
  auth: {
    user: process.env.email,
    pass: process.env.app_pw,
  },
});

// ✅ Middleware runner helper at the top of your file
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// ✅ Create the rate limiter, but DO NOT use as middleware
const customLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3,
  handler: (req, res) => {
    // This will be called if limit is exceeded
    return res.status(429).json({
      status: 429,
      error: "Too many requests. Try again in 5 minutes.",
      message: "Too many requests. Try again in 5 minutes.",
      icon: "warning",
    });
  },
  keyGenerator: ipKeyGenerator, // ✅ Safe for IPv4 + IPv6
});

// ✅ Generate OTP (random 8-digit number, CHAR)
function generateSecureOTP(length) {
  const charset =
    "0123456789";
  let otp = "";
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    otp += charset[randomBytes[i] % charset.length];
  }

  return otp;
}

// ------------------------------------------------------------
// ✅ 1. Multer (memory storage) for simple form parsing
//    Used for routes that only need text fields (no file saving).
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
});

// -------------------------------------------------------------
// ✅ Multer setup for login (with limit)
const loginstorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "logins/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const login = multer({
  storage: loginstorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2 MB
  }
});

// ------------------------------------------------------------
// ✅ Multer setup for Shapefile uploads
//    Stores shapefile ZIP uploads in the "shpuploads/" directory.
const storage = multer.diskStorage({
  destination: "shpuploads/",
  filename: (req, file, cb) => {
    // Use the original filename (without any modifications)
    cb(null, file.originalname);
  },
});


// tiff
const uploadDir = "tempuploads"; // base temp folder

const tiffstorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const theme = req.body.theme || "temp";
    const dir = path.join(uploadDir, theme);

    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },

  filename: (req, file, cb) => {
    const fileName = req.body.file_name;

    if (!fileName) {
      return cb(new Error("file_name is required"));
    }

    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${fileName}${ext}`);
  },
});

export const tiff_upload = multer({
  storage: tiffstorage,
  limits: {
    fileSize: 1024 * 1024 * 1024 * 18, // 18GB (adjust if needed)
  },
});


// ✅ Multer setup for shape file uploads

const shpupload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 * .3, // ~300 MB (adjust if needed)
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only ZIP files are allowed."));
    }
  },
});

// ----------------------------------------------------------

// ✅ Route: GET / (Login Page)
router.get("/", (req, res) => {
  try {
    res.status(200).render("adminLogin");
  } catch (error) {
    res.status(400).send(error);
  }
});



// ✅ Route: GET /admin/  login page (Dashboard, protected by adminAuth)
// -------------------------------
// Helpers
// -------------------------------

//Verifies Cloudflare Turnstile token.

async function verifyTurnstileToken(token, ip) {
  if (!token) {
    return {
      ok: false, error: {
        status: 400,
        body: {
          message: "Turnstile verification missing",
          title: "Security",
          icon: "warning",
        }
      }
    };
  }

  try {
    const verification = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    if (!verification.data.success) {
      return {
        ok: false, error: {
          status: 400,
          body: {
            message: "Unusual Activity Detected",
            title: "Try After Some Time",
            icon: "danger",
          }
        }
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("Turnstile verification error:", err);
    return {
      ok: false, error: {
        status: 500,
        body: {
          message: "Something went wrong",
          title: "Error",
          icon: "danger",
        }
      }
    };
  }
}

async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
    from: process.env.email,
    to,
    subject: "🔐 ASSAC | OTP Verification",
    html: `
      <div style="font-family: Arial, sans-serif">
        <h2>ASSAC OTP Verification</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>This OTP is valid for 5 minutes.</p>
      </div>
    `,
  });
}

// Fetch admin + keep client
async function getAdminWithClient(email) {
  const client = await poolUser.connect();
  const result = await client.query(
    "SELECT * FROM admins WHERE email = $1",
    [email]
  );
  client.release();
  return { admin: result.rows[0] || null };
}

// OTP expiry check
function isOtpValid(dbOtp, userOtp, time) {
  if (dbOtp !== userOtp) return false;
  const FIVE_MIN = 5 * 60 * 1000;
  return Date.now() - new Date(time).getTime() <= FIVE_MIN;
}

// ✅ Route: GET / (login,get opt )

router.post("/", async (req, res) => {
  const {
    email,
    password,
    otp,
    submit,
    "cf-turnstile-response": token,
  } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "All fields are required",
      title: "Warning",
      icon: "warning",
    });
  }

  // Turnstile (always)
  // const turnstile = await verifyTurnstileToken(token, req.ip);
  // if (!turnstile.ok) {
  //   return res.status(turnstile.error.status).json(turnstile.error.body);
  // }

  const { admin } = await getAdminWithClient(email);

  try {
    // Admin check
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(400).json({
        message: "Invalid credentials",
        title: "Warning",
        icon: "danger",
      });
    }

    /* ===================== OTP FLOW ===================== */
    if (submit === "GetOTP") {
      await runMiddleware(req, res, customLimiter);
      if (res.headersSent) {
        return;
      }

      const otpCode = generateSecureOTP(8);
      const client = await poolUser.connect();
      await client.query("DELETE FROM emailotp WHERE email = $1", [email]);
      await client.query(
        "INSERT INTO emailotp (email, otp) VALUES ($1, $2)",
        [email, otpCode]
      );

      client.release();
      await sendOtpEmail(email, otpCode);

      return res.json({
        message: "OTP sent successfully",
        title: "Sent",
        icon: "success",
      });
    }

    /* ===================== LOGIN FLOW ===================== */
    if (submit === "login") {
      if (!otp) {
        return res.status(400).json({
          message: "OTP is required",
          title: "Warning",
          icon: "warning",
        });
      }
      const client = await poolUser.connect();
      const otpRes = await client.query(
        "SELECT otp, time FROM emailotp WHERE email = $1",
        [email]
      );

      client.release();

      if (
        !otpRes.rows.length ||
        !isOtpValid(
          otpRes.rows[0].otp.toString(),
          otp,
          otpRes.rows[0].time
        )
      ) {
        return res.status(400).json({
          message: "Invalid or expired OTP",
          title: "Warning",
          icon: "danger",
        });
      }

      const jwtToken = jwt.sign(
        {
          email: admin.email,
          full_name: admin.full_name,
          organization: admin.organization,
          designation: admin.designation,
          admin_role: admin.admin_role,
        },
        process.env.adminSecretKey,
        { expiresIn: "100h" }
      );

      res.cookie("token", jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      });

      return res.json({
        message: "Login successful",
        title: "Success",
        icon: "success",
        redirect: "/admin/home",
      });
    }

    return res.status(400).json({
      message: "Invalid action",
      title: "Error",
      icon: "danger",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Something went wrong",
      title: "Error",
      icon: "danger",
    });
  }
});



// ✅ Route: GET /home (Dashboard, protected by adminAuth)
router.get("/home", adminAuthMiddleware, async (req, res) => {
  try {

    const client = await poolUser.connect();
    const result = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'raster'");
    const result1 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'lulc'");
    const result2 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'lulcchange'");
    const result3 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'hotspots'");
    const result4 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'aoi'");
    const result5 = await client.query("SELECT Count(file_name) from catalog WHERE theme = 'administrative'");
    client.release();

    // Combine counts in one object
    result.rows[0].rastercount = result.rows[0].count;
    result.rows[0].lulccount = result1.rows[0].count;
    result.rows[0].lulcchange = result2.rows[0].count;
    result.rows[0].hotspotcount = result3.rows[0].count;
    result.rows[0].aoicount = result4.rows[0].count;
    result.rows[0].administrativecount = result5.rows[0].count;

    const userItems = result.rows[0];


    res.status(200).render("adminHome", {
      userItems: userItems,
      admin_id: req.user.admin_id,
      full_name: req.user.full_name,
    });
  } catch (error) {
    const data = { message: error.message, title: "Oops?", icon: "danger" };
    return res.status(400).send(data);
  }
});


// BEFORE tus upload
router.get("/raster/precheck/:fileName", async (req, res) => {
  const { fileName } = req.params;

  const finalPath = path.join(
    process.cwd(),
    "raster_catalog",
    "raster",
    `${fileName}.tif`
  );

  if (fs.existsSync(finalPath)) {
    return res.status(409).json({ exists: true });
  }

  const { rowCount } = await poolUser.query(
    "SELECT 1 FROM catalog WHERE file_name=$1",
    [fileName]
  );

  if (rowCount > 0) {
    return res.status(409).json({ exists: true });
  }

  res.json({ ok: true });
});



// ✅ Route: GET /upload Get upload  Shapefiles/metadata Form  (Dashboard, protected by adminAuth)
router.get("/upload", adminAuthMiddleware, async (req, res) => {
  try {
    const client = await poolUser.connect();
    const { rows } = await client.query(
      "SELECT  file_name FROM catalog WHERE edit_mode=true"
    );
    client.release();
    res
      .status(200)
      .render("adminUpload", {
        catalogItems: rows,
        admin_id: req.user.admin_id,
        full_name: req.user.full_name,
      });
  } catch (error) {
    const data = { message: error, title: "Oops?", icon: "danger" };
    return res.status(400).json(data);
  }
});

// ✅ Route: POST /shpuploads Upload Shapefiles To database  (Dashboard, protected by adminAuth)
// ✅ Route: POST /shpuploads
// ✅ Route: POST /shpuploads
// ✅ Route: POST /shpuploads
router.post("/shpuploads", adminAuthMiddleware, shpupload.single("uploaded_file"),
  async (req, res) => {

    const cleanupFiles = () => {
      try {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        if (req.body?.file_name) {
          const extractDir = path.join("shpuploads", req.body.file_name);
          if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
          }
        }
      } catch (_) { }
    };

    try {
      const { file_type, theme, file_name, srid } = req.body;
      console.log(`[SHP Upload] Starting upload: ${file_name}, theme: ${theme}, SRID: ${srid}`);

      /* ---------------- VALIDATION ---------------- */

      const SAFE_NAME = /^[a-zA-Z0-9_]+$/;

      if (
        !file_name ||
        !file_type ||
        !theme ||
        !srid ||
        !SAFE_NAME.test(file_name) ||
        !SAFE_NAME.test(theme) ||
        !Number.isInteger(Number(srid))
      ) {
        console.warn(`[SHP Upload] Validation failed for ${file_name}`);
        cleanupFiles();
        return res.status(400).json({ message: "Invalid input parameters" });
      }

      if (!req.file || path.extname(req.file.originalname) !== ".zip") {
        console.warn(`[SHP Upload] Missing or invalid ZIP file for ${file_name}`);
        cleanupFiles();
        return res.status(400).json({ message: "ZIP file required" });
      }
      console.log(`[SHP Upload] Validation successful for ${file_name}`);

      /* ---------------- ZIP EXTRACTION ---------------- */

      const extractDir = path.join("shpuploads", file_name);
      console.log(`[SHP Upload] Extracting ZIP to: ${extractDir}`);
      new AdmZip(req.file.path).extractAllTo(extractDir, true);

      const shpPath = path.join(
        extractDir,
        req.file.originalname.replace(".zip", ".shp")
      );

      const shxPath = shpPath.replace(".shp", ".shx");
      const dbfPath = shpPath.replace(".shp", ".dbf");

      if (
        !fs.existsSync(shpPath) ||
        !fs.existsSync(shxPath) ||
        !fs.existsSync(dbfPath)
      ) {
        console.warn(`[SHP Upload] Missing mandatory components (.shp, .shx, or .dbf) in ZIP`);
        cleanupFiles();
        return res.status(400).json({ message: "Invalid shapefile contents" });
      }
      console.log(`[SHP Upload] Shapefile components verified`);

      /* ---------------- SAFE OS EXECUTION ---------------- */

      console.log(`[SHP Upload] Spawning shp2pgsql for ${file_name}`);
      const shp = spawn("shp2pgsql", [
        "-I",
        "-s",
        srid,
        shpPath,
        file_name,
      ]);

      const psql = spawn(
        "psql",
        ["-U", process.env.db_user, "-d", theme],
        {
          env: { ...process.env, PGPASSWORD: process.env.db_pw },
        }
      );

      shp.stdout.pipe(psql.stdin);
      let stderr = "";

      shp.stderr.on("data", (d) => (stderr += d.toString()));
      psql.stderr.on("data", (d) => (stderr += d.toString()));

      // Prevent server crash on EPIPE (broken pipe)
      psql.stdin.on("error", (err) => {
        if (err.code === "EPIPE") {
          console.warn("[SHP Upload] psql.stdin EPIPE detected - psql likely exited early.");
        } else {
          console.error(`[SHP Upload] psql.stdin error: ${err.message}`);
        }
      });

      psql.on("error", (err) => {
        console.error(`[SHP Upload] Failed to start psql: ${err.message}`);
        if (!shp.killed) shp.kill();
        cleanupFiles();
        if (!res.headersSent) {
          return res.status(500).json({ message: "Failed to start database import process" });
        }
      });

      psql.on("close", async (code) => {
        if (code !== 0) {
          console.error(`[SHP Upload] Database import failed with code ${code}. Error: ${stderr}`);
          if (!shp.killed) shp.kill();
          cleanupFiles();
          if (!res.headersSent) {
            return res.status(400).json({
              message: "Database import failed",
              details: stderr,
            });
          }
          return;
        }
        console.log(`[SHP Upload] Database import successful for ${file_name}`);

        /* ---------------- CATALOG INSERT ---------------- */

        try {
          const client = await poolUser.connect();
          await client.query(
            `INSERT INTO catalog 
             (file_name, file_type, theme, srid, visibility, is_published)
             VALUES ($1,$2,$3,$4,false,false)`,
            [file_name, file_type, theme, srid]
          );
          client.release();
          /* keep catalog zip */
          const catalogZipDir = path.join("catalog", theme);
          fs.mkdirSync(catalogZipDir, { recursive: true });
          const finalZipPath = path.join(catalogZipDir, `${file_name}.zip`);
          fs.copyFileSync(
            req.file.path,
            finalZipPath
          );
          console.log(`[SHP Upload] ZIP archived to ${finalZipPath}`);

          cleanupFiles();
          console.log(`[SHP Upload] Completed successfully for ${file_name}`);
          if (!res.headersSent) {
            return res.status(201).json({
              message: "Shapefile uploaded successfully",
            });
          }
        } catch (dbErr) {
          console.error(`[SHP Upload] Catalog update failed: ${dbErr.message}`);
          cleanupFiles();
          if (!res.headersSent) {
            return res.status(500).json({ message: "Import succeeded but catalog update failed" });
          }
        }
      });

      shp.on("error", (err) => {
        console.error(`[SHP Upload] shp2pgsql error: ${err.message}`);
        cleanupFiles();
        if (!res.headersSent) {
          return res.status(500).json({ message: "shp2pgsql failed", error: err.message });
        }
      });

    } catch (err) {
      cleanupFiles();
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);


// ✅ Route: GET /catalog/:file_name to fetch item details based on file_name of Repository  (Dashboard, protected by adminAuth)
router.get("/catalog/:file_name", async (req, res) => {
  try {
    const { file_name } = req.params;

    const uclient = await poolUser.connect();
    const result = await uclient.query(
      `SELECT * FROM catalog WHERE file_name = $1`,
      [file_name]
    );

    const title = result.rows[0].title;
    const file_type = result.rows[0].file_type;
    const theme = result.rows[0].theme;

    const publisher = result.rows[0].publisher;
    const language = result.rows[0].language;
    const public_access_level = result.rows[0].public_access_level;
    const citation = result.rows[0].citation;
    const source_date = result.rows[0].source_date;
    const group_visibility = result.rows[0].group_visibility;
    const data_abstract = result.rows[0].data_abstract;
    const metadata_date = result.rows[0].metadata_date;
    const display_date = result.rows[0].display_date;
    const area_of_interest = result.rows[0].area_of_interest;

    const data_quality = result.rows[0].data_quality;
    const projection = result.rows[0].projection;
    const scale = result.rows[0].scale;
    const district = result.rows[0].district;
    const tag = result.rows[0].tag;
    const department = result.rows[0].department;


    uclient.release();
    let client;

    let roundedWKT = null;

    if (file_type == 'vector') {


      console.log(theme);

      console.log(`SELECT ST_AsText(ST_Envelope(ST_Extent(geom))) AS bbox_geom_wkt
            FROM "${file_name}";`);

      const pool = getPoolByTheme(theme);

      client = await pool.connect();
      // const { rows } = await client.query('SELECT file_id, file_name FROM shapefiles WHERE file_name = $1', [file_name]);
      const { rows } = await client.query(
        `SELECT ST_AsText(ST_Envelope(ST_Extent(geom))) AS bbox_geom_wkt
            FROM "${file_name}";`
      );

      client.release();

      function roundWKT(wkt, decimals = 3) {
        if (!wkt) return "";
        return wkt
          .split(/([ ,()])/)
          .map(token => {
            if (!token.trim()) return token;
            const n = Number(token);
            return Number.isFinite(n) ? n.toFixed(decimals) : token;
          })
          .join("");
      }


      roundedWKT = roundWKT(rows[0].bbox_geom_wkt, 3);
    }


    // console.log(roundedWKT);

    if (result.rows.length > 0) {
      res.json({
        bbox: roundedWKT,
        title: title,
        theme: theme,
        file_type: file_type,
        publisher: publisher,
        language: language,
        public_access_level: public_access_level,
        citation: citation,
        source_date: source_date,
        group_visibility: group_visibility,
        data_abstract: data_abstract,
        metadata_date: metadata_date,
        display_date: display_date,
        area_of_interest: area_of_interest,
        data_quality: data_quality,
        projection: projection,
        scale: scale,
        district: district,
        tag: tag,
        department: department,
        category_id: result.rows[0].category_id
      });
    } else {
      res.status(404).send("File not found");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// ✅ Route: POST /metadata Upload Metadata To database  (Dashboard, protected by adminAuth)
router.post("/metadata", adminAuthMiddleware, upload.none(), async (req, res) => {

  const admin_fullname = req.user.full_name;
  const admin_email = req.user.email;
  const admin_organization = req.user.organization;

  // return

  const {
    meta_file_name,
    title,
    spatial_coverage,
    publisher,
    public_access_level,
    citation,
    source_date,
    display_date,
    group_visibility,
    data_abstract,
    area_of_interest,
    metadata_date,
    data_quality,
    language,
    projection,
    scale,
    meta_category_id,
  } = req.body;

  try {
    const client = await poolUser.connect();
    // const result = await uclient.query()
    // const theme = result.rows[0].theme

    const categoryIdParsed = meta_category_id ? parseInt(meta_category_id, 10) : null;

    await client.query(
      `
        UPDATE catalog SET
          title = $1,
          spatial_coverage = $2,
          publisher = $3,
          public_access_level = $4,
          citation = $5,
          source_date = $6,
          group_visibility = $7,
          data_abstract = $8,
          area_of_interest = $9,
          metadata_date = $10,
          display_date = $11,
          data_quality = $12,
          language = $13,
          projection = $14,
          scale = $15,
          edit_mode = $16,
          category_id = $17
        WHERE file_name = $18
      `,
      [
        title,
        spatial_coverage,
        publisher,
        public_access_level,
        citation,
        source_date,
        group_visibility,
        data_abstract,
        area_of_interest,
        metadata_date,
        display_date,
        data_quality,
        language,
        projection,
        scale,
        false,
        categoryIdParsed,
        meta_file_name
      ]
    );

    client.release();

    const data = {
      message: "Meta data updated successfuly",
      title: "Updated",
      icon: "success",
      redirect: "\\admin\\upload",
    };
    return res.json(data);

    //   res.redirect('/success'); // or send a JSON response
  } catch (err) {
    console.error("Error updating metadata:", err);
    const data = {
      message: "Error updating metadata",
      title: "Ooops",
      icon: "danger",
    };
    return res.status(500).json(data);
  }
}
);

// ✅ Route: GET /metadata to get Publish page to publish on geoserver  (Dashboard, protected by adminAuth)
router.get("/publish", adminAuthMiddleware, async (req, res) => {
  try {
    const client = await poolUser.connect();
    const { rows } = await client.query(
      "SELECT  file_name,title,theme FROM catalog WHERE is_published=false"
    );
    client.release();
    res.status(200).render("adminPublish", {
      catalogItems: rows,
      admin_id: req.user.admin_id,
      full_name: req.user.full_name,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
});

// ✅ Route: POST /catalog to  Publish  on geoserver using Geoserver Restapi  (Dashboard, protected by adminAuth)
router.post("/publish", upload.none(), adminAuthMiddleware, async (req, res) => {
  const { file_name, workspace, theme, title } = req.body;

  const admin_fullname = req.user.full_name;
  const admin_email = req.user.email;
  const admin_organization = req.user.organization;

  const DEFAULT_SRS = "EPSG:4326";
  const RESPONSE_STATUSES = {
    SUCCESS: "success",
    ERROR: "error",
    WARNING: "warning",
  };
  const store = theme;
  try {
    // GeoServer configuration
    const geoserverClient = axios.create({
      baseURL:
        process.env.geoserverurl ? `${process.env.geoserverurl}/rest` : "http://localhost:8080/geoserver/rest",
      auth: {
        username: process.env.GEOSERVER_USERNAME || "admin",
        password: process.env.GEOSERVER_PASSWORD || "geoserver",
      },
      timeout: 5000,
    });

    // Check if workspace exists
    // Check workspace
    try {
      await geoserverClient.get(`/workspaces/${workspace}`);
    } catch (error) {
      if (error.response?.status === 404) {
        return res.status(404).json({
          status: RESPONSE_STATUSES.ERROR,
          message: `Workspace "${workspace}" not found.`,
        });
      }
      throw error; // re-throw other errors
    }

    // Check datastore
    try {
      await geoserverClient.get(
        `/workspaces/${workspace}/datastores/${store}`
      );
    } catch (error) {
      if (error.response?.status === 404) {
        return res.status(404).json({
          status: RESPONSE_STATUSES.ERROR,
          message: `Datastore "${store}" not found in workspace "${workspace}".`,
          icon: "warning",
        });
      }
      throw error;
    }

    // Check if feature type exists
    const featureTypesResponse = await geoserverClient.get(
      `/workspaces/${workspace}/datastores/${store}/featuretypes`
    );
    const featureTypes =
      featureTypesResponse.data.featureTypes?.featureType || [];
    const featureTypeExists = featureTypes.some(
      (ft) => ft.name === file_name
    );

    if (featureTypeExists) {
      return res.status(400).json({
        status: RESPONSE_STATUSES.WARNING,
        message: "Layer already exists in the workspace",
        icon: "warning",
      });
    }

    // Create new feature type
    await geoserverClient.post(
      `/workspaces/${workspace}/datastores/${store}/featuretypes`,
      {
        featureType: {
          name: file_name,
          nativeName: file_name,
          title: title,
          srs: DEFAULT_SRS,
        },
      }
    );

    // Update database in a transaction
    const client = await poolUser.connect();
    try {
      await client.query("BEGIN");

      const catalogQuery = `
                UPDATE catalog
                SET visibility = $1, is_published = $2
                WHERE file_name = $3
            `;
      const catalogValues = [true, true, file_name];
      await client.query(catalogQuery, catalogValues);

      await client.query("COMMIT");
    } catch (dbError) {
      await client.query("ROLLBACK");
      throw dbError;
    } finally {
      client.release();
    }

    return res.status(201).json({
      status: RESPONSE_STATUSES.SUCCESS,
      title: "great",
      message: "File Published to GeoServer",
      icon: "success",
      data: { file_name },
      redirect: "\\admin\\publish",
    });
  } catch (error) {
    console.error("Error publishing layer:", error);
    return res.status(500).json({
      status: RESPONSE_STATUSES.ERROR,
      message: "Failed to publish layer",
      icon: "danger",
    });
  }
}
);

// ✅ Route: POST /publish-tiff to  Publish  on geoserver using Geoserver Restapi  (Dashboard, protected by adminAuth)
// POST /publish-tiff
router.post(
  "/publish-tiff",
  upload.none(),
  adminAuthMiddleware,
  async (req, res) => {
    const { file_name, workspace, theme } = req.body;

    try {
      // =====================================================
      // 1. CREATE GEOSERVER CLIENT
      // =====================================================

      const geoserver = axios.create({
        baseURL: `${process.env.geoserverurl}/rest`,
        auth: {
          username: process.env.GEOSERVER_USERNAME,
          password: process.env.GEOSERVER_PASSWORD,
        },
      });

      // =====================================================
      // 2. VALIDATION
      // =====================================================

      if (!file_name || !workspace || !theme) {
        return res.status(400).json({
          status: "error",
          message: "file_name, workspace and theme are required",
        });
      }

      const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

      if (
        !SAFE_NAME.test(file_name) ||
        !SAFE_NAME.test(theme) ||
        !SAFE_NAME.test(workspace)
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid characters in input",
        });
      }

      // =====================================================
      // 3. RASTER PATH
      // =====================================================

      const RASTER_DIR = process.env.RASTER_DIR;

      const rasterPath = path.join(
        RASTER_DIR,
        "raster",
        `${file_name}.tif`
      );

      console.log("[PUBLISH] Raster path:", rasterPath);

      // =====================================================
      // 4. CHECK FILE
      // =====================================================

      if (!fs.existsSync(rasterPath)) {
        return res.status(404).json({
          status: "error",
          title: "Raster not found",
          message: `GeoTIFF not found at path: ${rasterPath}`,
          icon: "error",
        });
      }

      const stat = fs.statSync(rasterPath);

      if (!stat.isFile() || stat.size === 0) {
        return res.status(400).json({
          status: "error",
          title: "Invalid raster file",
          message: "Raster file is empty or is not a regular file.",
          icon: "error",
        });
      }

      console.log("[PUBLISH] File size:", stat.size);

      // =====================================================
      // 5. CREATE + CONFIGURE COVERAGE STORE
      // =====================================================

      console.log("[PUBLISH] Creating GeoTIFF coverage store...");

      await geoserver.put(
        `/workspaces/${workspace}/coveragestores/${file_name}/external.geotiff`,
        rasterPath,
        {
          headers: {
            "Content-Type": "text/plain",
          },
          params: {
            configure: "first",
            coverageName: file_name,
          },
        }
      );

      console.log(
        `[PUBLISH] GeoServer store/coverage created: ${workspace}:${file_name}`
      );

      // =====================================================
      // 6. UPDATE DATABASE
      // =====================================================

      console.log("[PUBLISH] Updating catalog...");

      const client = await poolUser.connect();

      try {
        await client.query(
          `
            UPDATE catalog
            SET visibility = true,
                is_published = true
            WHERE file_name = $1
          `,
          [file_name]
        );
      } finally {
        client.release();
      }

      console.log("[PUBLISH] Catalog updated");

      // =====================================================
      // 7. SUCCESS
      // =====================================================

      return res.status(201).json({
        status: "success",
        message: "GeoTIFF published successfully",
        icon: "success",
      });

    } catch (error) {

      console.error("[PUBLISH] GeoTIFF publishing failed");

      if (error.response) {
        console.error(
          "[PUBLISH] HTTP status:",
          error.response.status
        );

        console.error(
          "[PUBLISH] GeoServer response:",
          error.response.data
        );
      } else {
        console.error(
          "[PUBLISH] Error:",
          error.message
        );
      }

      // =====================================================
      // GEOSERVER ERROR
      // =====================================================

      if (error.response) {
        const status = error.response.status;

        const gsMsg =
          typeof error.response.data === "string"
            ? error.response.data
            : error.response.data?.message ||
            JSON.stringify(error.response.data);

        if (status === 409) {
          return res.status(409).json({
            status: "warning",
            title: "Store already exists",
            message:
              `Coverage store "${file_name}" already exists`,
            icon: "warning",
            details: gsMsg,
          });
        }

        if (status === 400) {
          return res.status(400).json({
            status: "error",
            title: "GeoServer rejected the request",
            message:
              "GeoServer rejected the GeoTIFF publishing request.",
            icon: "danger",
            details: gsMsg,
          });
        }

        if (status === 500) {
          return res.status(500).json({
            status: "error",
            title: "GeoServer publishing failed",
            message:
              "GeoServer encountered an internal error while publishing the GeoTIFF.",
            icon: "danger",
            details: gsMsg,
          });
        }

        return res.status(status).json({
          status: "error",
          title: "GeoServer error",
          message: gsMsg,
          icon: "danger",
        });
      }

      // =====================================================
      // FILE ERROR
      // =====================================================

      if (error.code === "ENOENT") {
        return res.status(404).json({
          status: "error",
          title: "File missing",
          message: "Raster file not found on server",
          icon: "error",
        });
      }

      // =====================================================
      // UNKNOWN ERROR
      // =====================================================

      return res.status(500).json({
        status: "error",
        title: "Publish failed",
        message:
          error.message || "Unknown error",
        icon: "danger",
      });
    }
  }
);


// ✅ Route: POST /delete to  Delete The Layer from geoserver And Database  (Dashboard, protected by adminAuth)
router.post("/delete", adminAuthMiddleware, async (req, res) => {
  const { file_name, store, file_type, theme } = req.body;
  const workspace = "asdr";




  const geoserverUrl = `${process.env.geoserverurl}/rest`;
  const auth = {
    username: process.env.GEOSERVER_USERNAME,
    password: process.env.GEOSERVER_PASSWORD,
  };

  if (!file_name || !store || !file_type) {
    return res.status(400).json({
      message: "file_name, store and file_type are required",
      icon: "warning",
    });
  }

  try {
    /* =========================================================
       VECTOR DELETE
    ========================================================= */
    if (file_type === "vector") {
      // 1️⃣ Delete layer (safe even if missing)
      await axios.delete(`${geoserverUrl}/layers/${file_name}`, { auth })
        .catch(() => { });

      // 2️⃣ Delete feature type + datastore entry
      await axios.delete(
        `${geoserverUrl}/workspaces/${workspace}/datastores/${store}/featuretypes/${file_name}?recurse=true`,
        { auth }
      ).catch(() => { });

      // =====================================================
      // 2. RELOAD GEOSERVER CONFIGURATION
      // =====================================================

      try {
        await axios.post(
          `${geoserverUrl}/reload`,
          null,
          { auth }
        );

        console.log("[DELETE] GeoServer configuration reloaded");

      } catch (error) {

        console.error(
          "[DELETE] GeoServer reload failed:",
          error.response?.data || error.message
        );

        throw new Error(
          "GeoServer resource was deleted but configuration reload failed"
        );
      }


      // 3️⃣ Drop PostGIS table
      const pool = getPoolByTheme(store);
      const client2 = await pool.connect();
      await client2.query(`DROP TABLE IF EXISTS "${file_name}" CASCADE`);
      client2.release();
      // /* 4️⃣ Delete catalog ZIP copy */
      const catalogZipPath = path.join(
        process.cwd(),
        "catalog",
        theme,
        `${file_name}.zip`
      );

      if (fs.existsSync(catalogZipPath)) {
        fs.unlinkSync(catalogZipPath);
      }
    }

    /* =========================================================
       RASTER DELETE
    ========================================================= */
    if (file_type === "raster") {
      // =====================================================
      // 1. DELETE COVERAGE STORE + COVERAGE + LAYER
      // =====================================================

      try {
        await axios.delete(
          `${geoserverUrl}/workspaces/${workspace}/coveragestores/${file_name}?recurse=true`,
          { auth }
        );

        console.log(
          `[DELETE] GeoServer raster store deleted: ${workspace}:${file_name}`
        );

      } catch (error) {
        // 404 means it is already gone, which is okay
        if (error.response?.status !== 404) {
          throw error;
        }

        console.warn(
          `[DELETE] GeoServer raster store not found: ${workspace}:${file_name}`
        );
      }


      // =====================================================
      // 2. RELOAD GEOSERVER CONFIGURATION
      // =====================================================

      try {
        await axios.post(
          `${geoserverUrl}/reload`,
          null,
          { auth }
        );

        console.log("[DELETE] GeoServer configuration reloaded");

      } catch (error) {

        console.error(
          "[DELETE] GeoServer reload failed:",
          error.response?.data || error.message
        );

        throw new Error(
          "GeoServer resource was deleted but configuration reload failed"
        );
      }


      // =====================================================
      // 2. DELETE PHYSICAL GEOTIFF
      // =====================================================

      const RASTER_DIR = process.env.RASTER_DIR;

      const rasterPath = path.join(
        RASTER_DIR,
        "raster",
        `${file_name}.tif`
      );

      console.log("[DELETE] Raster path:", rasterPath);

      if (fs.existsSync(rasterPath)) {
        fs.unlinkSync(rasterPath);

        console.log(
          `[DELETE] Raster file deleted: ${rasterPath}`
        );
      } else {
        console.warn(
          `[DELETE] Raster file not found: ${rasterPath}`
        );
      }
    }


    /* =========================================================
       COMMON CLEANUP
    ========================================================= */

    // Delete from catalog
    const client = await poolUser.connect();
    await client.query(`DELETE FROM catalog WHERE file_name = $1`, [file_name]);

    client.release();

    return res.status(200).json({
      message: `${file_type} layer deleted successfully`,
      icon: "success",
      success: true,
    });

  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({
      message: "Failed to delete layer",
      icon: "danger",
      success: false,
    });
  }
});



// ✅ Route: GET /manage Get Page to  To manage all the layers on repository   (Dashboard, protected by adminAuth)
router.get("/manage", adminAuthMiddleware, async (req, res) => {
  try {
    const client = await poolUser.connect();

    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Adjust as needed
    const offset = (page - 1) * limit;
    const sortField = req.query.sortField || "sn";
    const sortOrder = req.query.sortOrder || "ASC";
    const searchField = req.query.searchField || "";
    const searchValue = req.query.searchValue || "";

    // Validate sortField to prevent SQL injection
    const validSortFields = [
      "sn",
      "title",
      "file_name",
      "file_type",
      "theme",
      "visibility",
      "edit_mode",
      "auto_display",
    ];
    const safeSortField = validSortFields.includes(sortField)
      ? sortField
      : "sn";
    const safeSortOrder = sortOrder.toUpperCase() === "DESC" ? "DESC" : "ASC";

    // Build query using recursive CTE to resolve category hierarchy paths
    let query = `
      WITH RECURSIVE category_path AS (
        SELECT id, name, parent_id, CAST(name AS VARCHAR(1000)) AS path
        FROM categories
        WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, c.name, c.parent_id, CAST(cp.path || ' > ' || c.name AS VARCHAR(1000))
        FROM categories c
        INNER JOIN category_path cp ON c.parent_id = cp.id
      )
      SELECT c.sn, c.file_name, c.file_type, c.title, c.theme, c.visibility, c.edit_mode, c.auto_display, cp.path AS category_path 
      FROM catalog c
      LEFT JOIN category_path cp ON c.category_id = cp.id
    `;
    let countQuery = "SELECT COUNT(*) FROM catalog c";
    let queryParams = [];
    let countParams = [];

    // Add search condition if provided
    if (searchField && searchValue) {
      const validSearchFields = ["title", "file_name", "theme"];
      if (validSearchFields.includes(searchField)) {
        queryParams.push(`%${searchValue}%`);
        countParams.push(`%${searchValue}%`);
        query += ` WHERE c.${searchField} ILIKE $${queryParams.length}`;
        countQuery += ` WHERE c.${searchField} ILIKE $${countParams.length}`;
      }
    }

    // Add sorting
    query += ` ORDER BY c.${safeSortField} ${safeSortOrder}`;

    // Add pagination
    queryParams.push(limit, offset);
    query += ` LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;

    // Execute queries
    const result = await client.query(query, queryParams);
    const catalogItems = result.rows;

    const countResult = await client.query(countQuery, countParams);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    client.release();

    res.status(200).render("adminCatalogManage", {
      catalogItems,
      currentPage: page,
      totalPages,
      sortField: safeSortField,
      sortOrder: safeSortOrder,
      searchField: searchField || "",
      searchValue: searchValue || "",
      admin_id: req.user.admin_id,
      full_name: req.user.full_name,
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).send("Server Error");
  }
});


// ✅ Route: POST /visibility Toggle visibility of layers on repository   (Dashboard, protected by adminAuth)
router.post("/visibility", adminAuthMiddleware, async (req, res) => {
  const { id, visibility } = req.body;

  if (id == null || visibility == null) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    const client = await poolUser.connect();
    const query = `
            UPDATE catalog
            SET visibility = $1
            WHERE sn = $2
        `;
    const values = [visibility, id];

    await client.query(query, values);
    client.release(); // Ensure the connection is released
    res
      .status(201)
      .json({ success: true, icon: "success", message: "Visibility Updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

// ✅ Route: POST /editmode Toggle editmode of layers on repository   (Dashboard, protected by adminAuth)
router.post("/editmode", adminAuthMiddleware, async (req, res) => {
  const { id, edit_mode } = req.body;

  if (id == null || edit_mode == null) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    const client = await poolUser.connect();
    const query = `
            UPDATE catalog
            SET edit_mode = $1
            WHERE sn = $2
        `;
    const values = [edit_mode, id];

    await client.query(query, values);
    client.release(); // Ensure the connection is released
    res
      .status(201)
      .json({ success: true, icon: "success", message: "Edit Mode Updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

// ✅ Route: POST /autodisplay Toggle auto_display of layers on repository (Dashboard, protected by adminAuth)
router.post("/autodisplay", adminAuthMiddleware, async (req, res) => {
  const { id, auto_display } = req.body;

  if (id == null || auto_display == null) {
    return res.status(400).json({ error: "Invalid request" });
  }

  try {
    const client = await poolUser.connect();
    const query = `
            UPDATE catalog
            SET auto_display = $1
            WHERE sn = $2
        `;
    const values = [auto_display, id];

    await client.query(query, values);
    client.release();
    res
      .status(201)
      .json({ success: true, icon: "success", message: "Auto Display Updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});






// ✅ Route: POST /logout Logout  (Dashboard, protected by adminAuth)
router.post("/logout", adminAuthMiddleware, (req, res) => {
  try {
    // Clear the cookie containing the token
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });

    // Send a success response
    const data = {
      message: "Logout successful",
      title: "Logged Out",
      icon: "success",
      redirect: "\\",
    };

    return res.json(data);
  } catch (error) {
    console.error(error);
    const data = { message: "Logout failed", title: "Error", icon: "error" };

    return res.status(500).json(data);
  }
});

// ✅ Route: GET /categories to fetch all categories (Dashboard, protected by adminAuth)
router.get("/categories", adminAuthMiddleware, async (req, res) => {
  try {
    const client = await poolUser.connect();
    const { rows } = await client.query("SELECT * FROM categories ORDER BY name ASC");
    client.release();
    return res.json({ categories: rows });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ✅ Route: POST /categories to create a category (Dashboard, protected by adminAuth)
router.post("/categories", adminAuthMiddleware, async (req, res) => {
  const { name, parent_id, type } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Category name is required" });
  }
  const parsedParentId = parent_id ? parseInt(parent_id, 10) : null;
  const categoryType = type || "theme";

  try {
    const client = await poolUser.connect();
    const { rows } = await client.query(
      "INSERT INTO categories (name, parent_id, type) VALUES ($1, $2, $3) RETURNING *",
      [name, parsedParentId, categoryType]
    );
    client.release();
    return res.json({ success: true, category: rows[0] });
  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).json({ error: "Failed to create category" });
  }
});

// ✅ Route: PUT /categories/:id to update/move a category (Dashboard, protected by adminAuth)
router.put("/categories/:id", adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, parent_id, type } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Category name is required" });
  }

  const catId = parseInt(id, 10);
  const parsedParentId = parent_id ? parseInt(parent_id, 10) : null;
  const categoryType = type || "theme";

  if (catId === parsedParentId) {
    return res.status(400).json({ error: "A category cannot be its own parent" });
  }

  try {
    const client = await poolUser.connect();

    // Prevent cycles: Check if the new parent is a descendant of this category
    if (parsedParentId) {
      const { rows: descendants } = await client.query(`
        WITH RECURSIVE category_tree AS (
          SELECT id, parent_id FROM categories WHERE id = $1
          UNION ALL
          SELECT c.id, c.parent_id FROM categories c
          INNER JOIN category_tree ct ON c.parent_id = ct.id
        )
        SELECT id FROM category_tree;
      `, [catId]);

      const descendantIds = descendants.map(d => d.id);
      if (descendantIds.includes(parsedParentId)) {
        client.release();
        return res.status(400).json({ error: "A category cannot be moved under one of its own subcategories (would cause a circular reference)" });
      }
    }

    const { rows } = await client.query(
      "UPDATE categories SET name = $1, parent_id = $2, type = $3 WHERE id = $4 RETURNING *",
      [name, parsedParentId, categoryType, catId]
    );
    client.release();

    if (rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    return res.json({ success: true, category: rows[0] });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({ error: "Failed to update category" });
  }
});

// ✅ Route: DELETE /categories/:id to delete a category (Dashboard, protected by adminAuth)
router.delete("/categories/:id", adminAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const client = await poolUser.connect();
    const { rowCount } = await client.query("DELETE FROM categories WHERE id = $1", [parseInt(id, 10)]);
    client.release();
    if (rowCount === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

// ✅ Route: GET /* 404 Not found page  (Dashboard, protected by adminAuth)
router.get("*", (req, res) => {
  res.render("404");
});

// ✅ Export the router
export default router;
