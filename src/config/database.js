const mysql = require('mysql2/promise');
const logger = require('./logger');

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Database connection established successfully');
    connection.release();
    return true;
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    return false;
  }
};

// Execute SQL query
const query = async (sql, params) => {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    logger.error(`Database query error: ${error.message}`);
    logger.error(`SQL: ${sql}`);
    logger.error(`Params: ${JSON.stringify(params)}`);
    throw error;
  }
};

// Execute transaction
const transaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    logger.error(`Transaction error: ${error.message}`);
    throw error;
  } finally {
    connection.release();
  }
};

// Setup database - create tables if they don't exist
const setupDatabase = async () => {
  try {
    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        phone VARCHAR(20) UNIQUE,
        email VARCHAR(255) UNIQUE,
        username VARCHAR(50) UNIQUE,
        password VARCHAR(255),
        bio TEXT,
        profile_picture VARCHAR(255),
        pic_id VARCHAR(36),
        interests JSON,
        vibe_preference VARCHAR(50),
        account_status ENUM('active', 'ghost', 'private', 'deleted') DEFAULT 'active',
        mode_preference ENUM('light', 'dark', 'party') DEFAULT 'light',
        auth_provider ENUM('local', 'google', 'apple') DEFAULT 'local',
        auth_provider_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // User sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        device_name VARCHAR(255),
        device_id VARCHAR(255),
        ip_address VARCHAR(45),
        location VARCHAR(255),
        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        user_agent TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Friendship table
    await query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id VARCHAR(36) PRIMARY KEY,
        requester_id VARCHAR(36) NOT NULL,
        addressee_id VARCHAR(36) NOT NULL,
        status ENUM('pending', 'accepted', 'rejected', 'blocked') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_friendship (requester_id, addressee_id)
      )
    `);

    // Rooms table
    await query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type ENUM('public', 'private') DEFAULT 'public',
        is_locked BOOLEAN DEFAULT FALSE,
        host_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Room participants table
    await query(`
      CREATE TABLE IF NOT EXISTS room_participants (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP NULL,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_room_user (room_id, user_id, is_active)
      )
    `);

    // Room join requests table
    await query(`
      CREATE TABLE IF NOT EXISTS room_join_requests (
        id VARCHAR(36) PRIMARY KEY,
        room_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Games table
    await query(`
      CREATE TABLE IF NOT EXISTS games (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rules TEXT,
        min_players INT DEFAULT 2,
        max_players INT DEFAULT 8,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Game sessions table
    await query(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id VARCHAR(36) PRIMARY KEY,
        game_id VARCHAR(36) NOT NULL,
        room_id VARCHAR(36) NOT NULL,
        status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        created_by VARCHAR(36) NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Game participants table
    await query(`
      CREATE TABLE IF NOT EXISTS game_participants (
        id VARCHAR(36) PRIMARY KEY,
        game_session_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        score INT DEFAULT 0,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP NULL,
        FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Media records table (screenshots, recordings)
    await query(`
      CREATE TABLE IF NOT EXISTS media_records (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        room_id VARCHAR(36) NOT NULL,
        type ENUM('screenshot', 'recording') NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      )
    `);

    // Notifications table
    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        type ENUM('friend_request', 'room_invite', 'room_join_request', 'game_invite', 'system') NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSON,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Notification settings table
    await query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        user_id VARCHAR(36) PRIMARY KEY,
        friend_requests BOOLEAN DEFAULT TRUE,
        room_invites BOOLEAN DEFAULT TRUE,
        room_join_requests BOOLEAN DEFAULT TRUE,
        game_invites BOOLEAN DEFAULT TRUE,
        system_notifications BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Device tokens table (for push notifications)
    await query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        device_token VARCHAR(255) NOT NULL,
        device_type ENUM('ios', 'android', 'web') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_device_token (device_token)
      )
    `);

    // OTP table
    await query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id VARCHAR(36) PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_phone (phone),
        INDEX idx_expires_at (expires_at)
      )
    `);

    // Analytics - Daily active users
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_daily_users (
        date DATE PRIMARY KEY,
        active_users INT DEFAULT 0,
        new_users INT DEFAULT 0
      )
    `);

    // Analytics - Game activity
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_game_activity (
        id VARCHAR(36) PRIMARY KEY,
        game_id VARCHAR(36) NOT NULL,
        date DATE NOT NULL,
        sessions_count INT DEFAULT 0,
        players_count INT DEFAULT 0,
        avg_duration_seconds INT DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        UNIQUE KEY unique_game_date (game_id, date)
      )
    `);

    // Analytics - Room activity
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_room_activity (
        id VARCHAR(36) PRIMARY KEY,
        date DATE NOT NULL,
        rooms_created INT DEFAULT 0,
        total_active_rooms INT DEFAULT 0,
        avg_duration_minutes INT DEFAULT 0,
        max_concurrent_users INT DEFAULT 0
      )
    `);

    logger.info('Database setup completed successfully');
  } catch (error) {
    logger.error(`Database setup error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  query,
  transaction,
  testConnection,
  setupDatabase,
};