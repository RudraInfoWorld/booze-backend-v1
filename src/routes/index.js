const express = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const friendRoutes = require('./friendRoutes');
const roomRoutes = require('./roomRoutes');
const gameRoutes = require('./gameRoutes');
const notificationRoutes = require('./notificationRoutes');
const mediaRoutes = require('./mediaRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const { catchAsync, AppError } = require('../utils/errorHandler');
const logger = require('../config/logger');

const router = express.Router();

// API Health Check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date()
  });
});

// API Documentation
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Welcome to Booze API',
    version: '1.0.0',
    documentation: 'API documentation will be available here'
  });
});

// Mount Routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/friends', friendRoutes);
router.use('/rooms', roomRoutes);
router.use('/games', gameRoutes);
router.use('/notifications', notificationRoutes);
router.use('/media', mediaRoutes);
router.use('/analytics', analyticsRoutes);

// 404 Handler
router.all('*', (req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server!`, 404));
});

module.exports = router;