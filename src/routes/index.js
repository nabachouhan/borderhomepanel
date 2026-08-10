// index.js (or mainRoutes)

import express from 'express';
const router = express.Router();

// Import route modules (make sure each is using `export default`)
import homeRoutes from './home.js';
import adminRoutes from './admin.js';

// Mount routes
router.use('/', homeRoutes);
router.use('/admin', adminRoutes);

// ❗ This 404 should be here ONLY
router.get('*', (req, res) => {
    res.status(404).render("404");
});

// Export router
export default router;
